#!/usr/bin/env python3
"""
build_assets.py — precompute pollen's vocab-map assets for every selectable model.

Run once per machine (or once, and ship the output). For each model it:
  1. loads the model via mlx_lm and pulls the token embedding matrix
  2. PCA -> 50D, then UMAP -> 2D, normalized to [0, 1]
  3. writes coords as a compact binary blob in token-id order, plus the
     token display strings and a manifest carrying an embedding fingerprint

The app reads coords.u16.bin as vocabPoints (index == token id), and checks
manifest.embedding_hash against the model it actually loaded. That check is
the whole point of the fingerprint: coords baked from one tokenizer indexed
by another model's token ids render a plausible-looking map that means
nothing.

Models are processed one at a time and unloaded between, so only one set of
weights is resident at once.

Output defaults to src/pollen/assets, resolved against THIS FILE (not the
working directory) — the same directory main.py serves at /assets and
model_registry.py reads models.json from directly, so the assets land where
they're actually used no matter where you run it. Nothing needs moving by
hand.

Usage:
    python -m pollen.build_assets                    # all models -> src/pollen/assets
    python -m pollen.build_assets --models mlx-community/Qwen3-4B-4bit
    python -m pollen.build_assets --force             # ignore cache, recompute
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# Every model the app offers in its model picker. Each gets its own asset
# directory; nothing is shared between them, because nothing can be — different
# tokenizers mean different vocabularies and non-comparable projections.
DEFAULT_MODELS = [
    "mlx-community/Qwen3-4B-4bit",
    "mlx-community/Llama-3.2-3B-Instruct-4bit",
    "mlx-community/Mistral-7B-Instruct-v0.3-4bit",
]

PCA_DIMS = 50
UMAP_NEIGHBORS = 15
UMAP_MIN_DIST = 0.1
RANDOM_STATE = 42

ASSET_VERSION = 2

# Resolved against this file's location, not the cwd — `python -m pollen.build_assets`
# lands in the same place regardless of where it's invoked from, or the app
# silently keeps serving stale assets.
_HERE = Path(__file__).resolve().parent
DEFAULT_OUT = _HERE / "assets"
DEFAULT_CACHE = _HERE / ".asset_cache"


def safe_name(model_name: str) -> str:
    return model_name.replace("/", "__")


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


# --------------------------------------------------------------------------
# Stage 1 — extraction (requires MLX; Apple Silicon only)
# --------------------------------------------------------------------------

def get_embedding_matrix(model) -> "np.ndarray":
    """Pull the token embedding table out of a loaded MLX model.

    Two non-obvious steps, both load-bearing:

    - Quantized models store packed integer codes in `.weight` alongside
      separate `.scales`/`.biases`. Casting those codes straight to float
      yields packing artifacts, not embeddings — any projection computed from
      them is structured noise that still looks like a map.
    - Cast inside MLX before handing anything to numpy. Embedding tables are
      often bfloat16 even in otherwise-quantized models, and bfloat16 does not
      convert cleanly through numpy's buffer protocol.
    """
    import mlx.core as mx

    for attr_path in (
        "model.embed_tokens",
        "model.tok_embeddings",
        "embed_tokens",
        "tok_embeddings",
    ):
        obj = model
        try:
            for part in attr_path.split("."):
                obj = getattr(obj, part)
        except AttributeError:
            continue

        if hasattr(obj, "scales") and hasattr(obj, "biases"):
            weight = mx.dequantize(
                obj.weight,
                scales=obj.scales,
                biases=obj.biases,
                group_size=obj.group_size,
                bits=obj.bits,
            )
        else:
            weight = obj.weight

        weight = weight.astype(mx.float32)
        mx.eval(weight)
        return np.array(weight)

    raise RuntimeError(
        "Could not locate an embedding matrix on this model. Add its attribute "
        "path to get_embedding_matrix()."
    )


def build_id2display(tokenizer, vocab_size: int) -> list[str]:
    """id -> human-readable token text, for map hover labels.

    Raw vocab strings carry BPE/SentencePiece markers (the space and newline
    stand-ins) instead of real whitespace; decoding resolves them back to text.
    """
    try:
        return tokenizer.batch_decode([[i] for i in range(vocab_size)])
    except Exception:
        return [tokenizer.decode([i]) for i in range(vocab_size)]


def extract(model_name: str) -> dict:
    """Load a model, take what we need, unload it."""
    import mlx.core as mx
    from mlx_lm import load

    log(f"loading {model_name} ...")
    t0 = time.time()
    model, tokenizer = load(model_name)
    log(f"loaded in {time.time() - t0:.0f}s")

    embeddings = get_embedding_matrix(model)
    vocab_size, hidden_dim = embeddings.shape
    log(f"embeddings: vocab={vocab_size:,} dim={hidden_dim}")

    # Sanity check against the classic failure: a quantized table read without
    # dequantizing yields a hidden dim that's a fraction of the real one.
    if hidden_dim < 256:
        raise RuntimeError(
            f"hidden_dim={hidden_dim} is implausibly small — the embedding table "
            "was almost certainly read without dequantizing. Refusing to build "
            "assets from packing artifacts."
        )

    embedding_hash = hashlib.sha256(embeddings.tobytes()).hexdigest()[:16]
    id2display = build_id2display(tokenizer, vocab_size)

    del model, tokenizer
    gc.collect()
    if hasattr(mx, "metal"):
        mx.metal.clear_cache()

    return {
        "embeddings": embeddings,
        "id2display": id2display,
        "vocab_size": int(vocab_size),
        "embedding_dim": int(hidden_dim),
        "embedding_hash": embedding_hash,
    }


# --------------------------------------------------------------------------
# Stage 2 — projection (pure numpy/sklearn; runs anywhere)
# --------------------------------------------------------------------------

def project_2d(embeddings: "np.ndarray") -> tuple["np.ndarray", float]:
    """PCA to 50D, then UMAP to 2D, normalized to [0, 1] per axis.

    No t-SNE fallback on purpose. A silent fallback produces a different map
    under the same filename with no record of which method made it — the coords
    would still load and still look fine.
    """
    from sklearn.decomposition import PCA

    n_components = min(PCA_DIMS, embeddings.shape[1], embeddings.shape[0])
    log(f"PCA -> {n_components}D ...")
    pca = PCA(n_components=n_components, random_state=RANDOM_STATE)
    reduced = pca.fit_transform(embeddings)
    variance = float(pca.explained_variance_ratio_.sum())
    log(f"PCA variance explained: {variance:.3f}")

    try:
        from umap import UMAP
    except ImportError:
        raise SystemExit(
            "umap-learn is required and not installed.\n"
            "  pip install umap-learn"
        )

    log("UMAP -> 2D (slow: expect 10-30 min at full vocabulary) ...")
    t0 = time.time()
    reducer = UMAP(
        n_components=2,
        n_neighbors=UMAP_NEIGHBORS,
        min_dist=UMAP_MIN_DIST,
        random_state=RANDOM_STATE,  # forces single-threaded, but keeps runs reproducible
        verbose=True,
    )
    coords = reducer.fit_transform(reduced).astype(np.float32)
    log(f"UMAP done in {time.time() - t0:.0f}s")

    coords -= coords.min(axis=0)
    coords /= coords.max(axis=0) + 1e-10
    return coords, variance


# --------------------------------------------------------------------------
# Stage 3 — export
# --------------------------------------------------------------------------

def write_model_assets(
    out_dir: Path,
    model_name: str,
    coords: "np.ndarray",
    id2display: list[str],
    meta: dict,
    write_tokens: bool,
) -> dict:
    """Write coords.u16.bin (+ tokens.json) + manifest.json for one model."""
    out_dir.mkdir(parents=True, exist_ok=True)

    # uint16 rather than float32: coords are normalized to [0, 1] and land on
    # a screen a few hundred px wide, so 1/65535 is far below one pixel. Halves
    # the payload against float32 and quarters it against JSON.
    quantized = np.clip(np.rint(coords * 65535.0), 0, 65535).astype("<u2")
    coords_path = out_dir / "coords.u16.bin"
    quantized.tofile(coords_path)
    coords_bytes = coords_path.stat().st_size

    files = {
        "coords": {
            "path": "coords.u16.bin",
            "format": "uint16le",
            "layout": "interleaved xy, row index == token id",
            "count": int(coords.shape[0]),
            "decode": "value / 65535 -> [0,1]",
            "bytes": coords_bytes,
        }
    }

    # Token strings are only needed for map hover, so they're a separate file
    # the app can fetch lazily — they're bigger than the coords themselves.
    if write_tokens:
        tokens_path = out_dir / "tokens.json"
        with open(tokens_path, "w") as f:
            json.dump(id2display, f, ensure_ascii=False)
        files["tokens"] = {
            "path": "tokens.json",
            "format": "json array, index == token id",
            "count": len(id2display),
            "bytes": tokens_path.stat().st_size,
            "lazy": True,
        }

    manifest = {
        "asset_version": ASSET_VERSION,
        "model_name": model_name,
        "embedding_hash": meta["embedding_hash"],
        "vocab_size": meta["vocab_size"],
        "embedding_dim": meta["embedding_dim"],
        "projection": {
            "pca_dims": PCA_DIMS,
            "pca_variance_explained": round(meta["pca_variance"], 4),
            "method": "umap",
            "n_neighbors": UMAP_NEIGHBORS,
            "min_dist": UMAP_MIN_DIST,
            "random_state": RANDOM_STATE,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "files": files,
    }
    with open(out_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    return manifest


def verify(out_dir: Path, manifest: dict) -> None:
    """Read back what we just wrote and check it decodes to what we expect."""
    spec = manifest["files"]["coords"]
    raw = np.fromfile(out_dir / spec["path"], dtype="<u2")
    expected = spec["count"] * 2
    if raw.size != expected:
        raise RuntimeError(f"coords readback: got {raw.size} values, expected {expected}")

    xy = raw.reshape(-1, 2).astype(np.float32) / 65535.0
    if not (0.0 <= xy.min() and xy.max() <= 1.0):
        raise RuntimeError(f"coords out of range after decode: [{xy.min()}, {xy.max()}]")
    if xy.shape[0] != manifest["vocab_size"]:
        raise RuntimeError(
            f"coords rows ({xy.shape[0]}) != vocab_size ({manifest['vocab_size']}) — "
            "the app indexes this array by token id, so they must match exactly"
        )

    if "tokens" in manifest["files"]:
        with open(out_dir / manifest["files"]["tokens"]["path"]) as f:
            toks = json.load(f)
        if len(toks) != manifest["vocab_size"]:
            raise RuntimeError(f"tokens length {len(toks)} != vocab_size {manifest['vocab_size']}")

    log("verified: coords decode in range, lengths agree with vocab_size")


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------

def build_one(model_name: str, out_root: Path, cache_dir: Path, force: bool, write_tokens: bool) -> dict:
    slug = safe_name(model_name)
    out_dir = out_root / slug
    cache_path = cache_dir / f"{slug}_projection.npz"

    if out_dir.joinpath("manifest.json").exists() and not force:
        existing = json.loads(out_dir.joinpath("manifest.json").read_text())
        if existing.get("asset_version") == ASSET_VERSION:
            log("assets already present and current — skipping (use --force to rebuild)")
            return existing

    # Projection cache: the UMAP fit is by far the most expensive step, and it
    # only depends on the embeddings. Cache the result, not the 1.5GB input.
    if cache_path.exists() and not force:
        log(f"using cached projection: {cache_path.name}")
        cached = np.load(cache_path, allow_pickle=True)
        coords = cached["coords"]
        id2display = list(cached["id2display"])
        meta = json.loads(str(cached["meta"]))
    else:
        data = extract(model_name)
        coords, variance = project_2d(data["embeddings"])
        del data["embeddings"]
        gc.collect()

        meta = {
            "embedding_hash": data["embedding_hash"],
            "vocab_size": data["vocab_size"],
            "embedding_dim": data["embedding_dim"],
            "pca_variance": variance,
        }
        id2display = data["id2display"]

        cache_dir.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            cache_path,
            coords=coords,
            id2display=np.array(id2display, dtype=object),
            meta=json.dumps(meta),
        )
        log(f"cached projection -> {cache_path.name}")

    manifest = write_model_assets(out_dir, model_name, coords, id2display, meta, write_tokens)
    verify(out_dir, manifest)
    total = sum(f["bytes"] for f in manifest["files"].values())
    log(f"wrote {out_dir}  ({total / 1_048_576:.1f} MB)")
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models", nargs="+", default=DEFAULT_MODELS,
                    help="model ids to build assets for (default: all selectable models)")
    ap.add_argument("--out", default=None,
                    help="output root directory (default: src/pollen/assets)")
    ap.add_argument("--cache", default=None,
                    help="cache directory for projections (default: ./.asset_cache)")
    ap.add_argument("--force", action="store_true", help="rebuild even if assets/cache exist")
    ap.add_argument("--no-tokens", action="store_true",
                    help="skip tokens.json (map hover labels will be unavailable)")
    args = ap.parse_args()

    out_root = Path(args.out).resolve() if args.out else DEFAULT_OUT
    cache_dir = Path(args.cache).resolve() if args.cache else DEFAULT_CACHE
    out_root.mkdir(parents=True, exist_ok=True)

    print(f"Building assets for {len(args.models)} model(s) -> {out_root}/\n")

    index = []
    failures = []
    for i, model_name in enumerate(args.models, 1):
        print(f"[{i}/{len(args.models)}] {model_name}")
        try:
            manifest = build_one(model_name, out_root, cache_dir, args.force, not args.no_tokens)
            index.append({
                "model_name": model_name,
                "dir": safe_name(model_name),
                "vocab_size": manifest["vocab_size"],
                "embedding_hash": manifest["embedding_hash"],
            })
        except Exception as e:
            log(f"FAILED: {e}")
            failures.append((model_name, str(e)))
        print()

    # models.json is what the app's model picker reads.
    with open(out_root / "models.json", "w") as f:
        json.dump({"asset_version": ASSET_VERSION, "models": index}, f, indent=2)

    print(f"Wrote {out_root / 'models.json'} — {len(index)} model(s) available")

    if failures:
        print("\nFailed:")
        for name, err in failures:
            print(f"  {name}: {err}")
        return 1

    total = sum(
        p.stat().st_size for p in out_root.rglob("*") if p.is_file()
    )
    print(f"Total shipped size: {total / 1_048_576:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())