#!/usr/bin/env python3
"""bake_gallery.py — produce the static gallery: zero-cost, no backend
required to view it.

Reads a JSON config of prompt + lens-combination runs, plays each one
through the real generator (same Pollinator, same generate_interleaved used
live), and writes the exact frame sequence each run produced to
frontend/public/gallery/<slug>.json, plus an index.

The frame list recorded here is byte-for-byte the same shape as what
main.py's SSE stream sends — a gallery "player" in the frontend just
iterates an array instead of consuming an EventSource; it is not a second
rendering path.

Usage (from a source checkout, package installed with the `build` extra):
    python -m pollen.bake_gallery --config gallery_config.json
    python -m pollen.bake_gallery --config gallery_config.json --out ../frontend/public/gallery
"""

from __future__ import annotations

import argparse
import gc
import json
import sys
from pathlib import Path

# _HERE is src/pollen/ — reaching the (unshipped, dev-only) frontend/ source
# tree needs two levels up to the repo root, not one.
_HERE = Path(__file__).resolve().parent
DEFAULT_OUT = _HERE.parent.parent / "frontend" / "public" / "gallery"

from . import session as session_module
from .schemas import ChatRequest, with_length


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def _build_panel_configs(request: ChatRequest, sess: dict):
    """Mirrors main.py's _build_panel_configs exactly — duplicated rather
    than imported so this script has no dependency on the live server
    module, and so session.py (carried over verbatim) doesn't need a new
    export bolted onto it."""
    baseline_config = {
        "system_prompt": with_length("", request.length_hint),
        "conversation": session_module.assemble_conversation(
            sess, "baseline", None, request.user_message, request.history_mode
        ),
    }

    lens_configs = []
    for i, lens in enumerate(request.lenses):
        panel_id = f"lens_{i}"
        lens_configs.append(
            {
                "id": panel_id,
                "system_prompt": with_length(lens.system_prompt, request.length_hint),
                "conversation": session_module.assemble_conversation(
                    sess, "lens", panel_id, request.user_message, request.history_mode
                ),
            }
        )

    mix_configs = None
    if len(request.lenses) >= 2:
        mixed_conversation = session_module.assemble_conversation(
            sess, "mixed", None, request.user_message, request.history_mode
        )
        mix_configs = [
            {
                "id": f"lens_{i}",
                "weight": lens.weight,
                "system_prompt": with_length(lens.system_prompt, request.length_hint),
                "conversation": mixed_conversation,
            }
            for i, lens in enumerate(request.lenses)
        ]

    return baseline_config, lens_configs, mix_configs


class _ModelSlot:
    """At most one Pollinator resident at a time, same constraint as the
    live model_registry — a batch run through several 4-bit models must not
    hold two in memory simultaneously."""

    def __init__(self):
        self.model_name: str | None = None
        self.pollinator = None
        self.embedding_hash: str | None = None

    def get(self, model_name: str):
        if self.model_name == model_name:
            return self.pollinator, self.embedding_hash

        import hashlib

        if self.pollinator is not None:
            self.pollinator = None
            gc.collect()
            import mlx.core as mx

            if hasattr(mx, "metal"):
                mx.metal.clear_cache()

        from .pollinator import Pollinator

        log(f"loading {model_name} ...")
        pollinator = Pollinator(model_name)
        embedding_hash = hashlib.sha256(pollinator.embedding_matrix.tobytes()).hexdigest()[:16]

        self.model_name = model_name
        self.pollinator = pollinator
        self.embedding_hash = embedding_hash
        return pollinator, embedding_hash


def bake_run(run_spec: dict, slot: _ModelSlot, out_dir: Path) -> dict:
    slug = run_spec["slug"]
    request = ChatRequest(
        session_id=f"gallery-{slug}",
        user_message=run_spec["user_message"],
        lenses=run_spec.get("lenses", []),
        model_name=run_spec["model_name"],
        combine_mode=run_spec.get("combine_mode", "common_ground"),
        weight_mode=run_spec.get("weight_mode", "equal"),
        history_mode=run_spec.get("history_mode", "only_mixed"),
        max_new_tokens=run_spec.get("max_new_tokens", 600),
        temperature=run_spec.get("temperature", 1.0),
        length_hint=run_spec.get("length_hint", ""),
    )

    pollinator, embedding_hash = slot.get(request.model_name)
    sess = session_module.get_session(request.session_id)
    baseline_config, lens_configs, mix_configs = _build_panel_configs(request, sess)

    log(f"generating {slug} ({request.model_name}) ...")
    frames = list(
        pollinator.generate_interleaved(
            baseline_config=baseline_config,
            lens_configs=lens_configs,
            mix_configs=mix_configs,
            combine_mode=request.combine_mode,
            weight_mode=request.weight_mode,
            max_new_tokens=request.max_new_tokens,
            temperature=request.temperature,
        )
    )
    frames.append({"type": "done"})

    record = {
        "slug": slug,
        "model_name": request.model_name,
        "embedding_hash": embedding_hash,
        "user_message": request.user_message,
        "lenses": [lens.model_dump() for lens in request.lenses],
        "combine_mode": request.combine_mode,
        "weight_mode": request.weight_mode,
        "history_mode": request.history_mode,
        "length_hint": request.length_hint,
        "frames": frames,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{slug}.json"
    with open(out_path, "w") as f:
        json.dump(record, f)
    log(f"wrote {out_path} ({len(frames)} frames)")

    return {
        "slug": slug,
        "model_name": request.model_name,
        "user_message": request.user_message,
        "lens_names": [lens.name for lens in request.lenses],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", required=True, help="JSON file listing gallery runs")
    ap.add_argument("--out", default=None, help="output dir (default: ../frontend/public/gallery)")
    args = ap.parse_args()

    config_path = Path(args.config).resolve()
    out_dir = Path(args.out).resolve() if args.out else DEFAULT_OUT

    runs = json.loads(config_path.read_text())
    if isinstance(runs, dict):
        runs = runs["runs"]

    slot = _ModelSlot()
    index = []
    failures = []
    for i, run_spec in enumerate(runs, 1):
        print(f"[{i}/{len(runs)}] {run_spec['slug']}")
        try:
            index.append(bake_run(run_spec, slot, out_dir))
        except Exception as e:
            log(f"FAILED: {e}")
            failures.append((run_spec.get("slug", "?"), str(e)))
        print()

    with open(out_dir / "index.json", "w") as f:
        json.dump({"runs": index}, f, indent=2)
    print(f"Wrote {out_dir / 'index.json'} — {len(index)} run(s)")

    if failures:
        print("\nFailed:")
        for slug, err in failures:
            print(f"  {slug}: {err}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
