"""Owns which model is resident.

Lazy: nothing loads at import time or at server startup — only the first
request that actually needs a model (an explicit switch, or a chat request
naming one) triggers a load. This module must stay importable, and the
server startable, with neither mlx nor mlx_lm installed, as long as nothing
ever calls switch()/ensure_loaded() — pollinator (and therefore mlx) is only
imported inside switch(), not at module top. huggingface_hub is imported
lazily for the same reason: it only ever arrives as an mlx-lm dependency, so
a fixtures-only install (no mlx/mlx-lm) wouldn't have it either.

At most one model resident at a time: two 4-bit models loaded simultaneously
will exhaust memory on a laptop. Switching always fully unloads the previous
one first.
"""

from __future__ import annotations

import fnmatch
import gc
import hashlib
import json
import shutil
import threading
from pathlib import Path

# Resolved against this file's location — src/pollen/assets/ ships inside
# the installed package itself (committed, not generated at install time),
# so this is correct whether running from a source checkout or a wheel.
_HERE = Path(__file__).resolve().parent
_MODELS_JSON = _HERE / "assets" / "models.json"

# Mirrors mlx_lm.utils._download's default allow_patterns — not exported by
# mlx_lm as a public constant, so duplicated here. Used to size the expected
# download (for progress) against Hugging Face's own file listing, not to
# control what snapshot_download actually fetches differently from mlx_lm.
ALLOW_PATTERNS = [
    "*.json",
    "model*.safetensors",
    "*.py",
    "tokenizer.model",
    "*.tiktoken",
    "tiktoken.model",
    "*.txt",
    "*.jsonl",
    "*.jinja",
]


class RegistryBusyError(Exception):
    """A switch (or a chat request implying one) was attempted while a
    generation is in flight."""


class ModelNotAvailableError(Exception):
    """The requested model has no built assets, the assets on disk don't
    match what's actually loaded into memory, or downloading/loading it
    failed (network, disk space, Hugging Face unreachable)."""


class NoModelLoadedError(Exception):
    """ensure_loaded(None) was called with nothing resident yet."""


def _matches_allow_patterns(filename: str) -> bool:
    return any(fnmatch.fnmatch(filename, pat) for pat in ALLOW_PATTERNS)


def _compute_expected_bytes(model_name: str) -> int:
    from huggingface_hub import HfApi

    info = HfApi().model_info(model_name, files_metadata=True)
    return sum((s.size or 0) for s in info.siblings if _matches_allow_patterns(s.rfilename))


def _disk_progress_bytes(model_name: str) -> int:
    """Actual bytes on disk for this repo's cache folder right now —
    computed fresh each call from the filesystem, not from a callback. This
    includes in-progress partial-download files alongside completed blobs;
    whatever huggingface_hub happens to name them, they live under the same
    per-repo blobs/ directory and grow as the transfer proceeds, so summing
    everything there is correct regardless of huggingface_hub's internal
    naming for incomplete files (which isn't a documented, stable contract
    the way the cache folder layout itself is)."""
    from huggingface_hub.constants import HF_HUB_CACHE
    from huggingface_hub.file_download import repo_folder_name

    folder = Path(HF_HUB_CACHE) / repo_folder_name(repo_id=model_name, repo_type="model")
    blobs = folder / "blobs"
    if not blobs.exists():
        return 0
    return sum(f.stat().st_size for f in blobs.iterdir() if f.is_file())


def _check_disk_space(total_bytes: int) -> None:
    free = shutil.disk_usage(Path.home()).free
    # The model needs roughly its own size again temporarily — partial
    # blobs alongside the eventual complete ones, plus headroom for MLX's
    # own loading — 1.5x is a reasonable margin, not an overly strict one.
    required = int(total_bytes * 1.5)
    if free < required:
        raise ModelNotAvailableError(
            f"not enough free disk space to download this model: {free / 1e9:.1f}GB free, ~{required / 1e9:.1f}GB needed"
        )


class ModelRegistry:
    def __init__(self):
        self._pollinator = None  # pollinator.Pollinator | None
        self._embedding_hash: str | None = None
        self._vocab_size: int | None = None
        self._lock = threading.Lock()
        self._generating = False

        # Separate lock from _lock above: switch() holds _lock for the
        # entire download+load duration (which can be minutes), and status
        # polling has to stay cheap and responsive throughout that whole
        # window rather than blocking behind it.
        self._status_lock = threading.Lock()
        self._status: dict = {"state": "absent", "progress": 0.0, "model_name": None, "error": None}
        self._expected_bytes: dict[str, int] = {}

    # ── availability ──────────────────────────────────────────────────────

    def list_models(self) -> list[dict]:
        """Models with built assets — the only ones offerable. A model
        absent from models.json simply isn't listed."""
        try:
            data = json.loads(_MODELS_JSON.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return []
        return data.get("models", [])

    def _asset_entry(self, model_name: str) -> dict | None:
        for m in self.list_models():
            if m["model_name"] == model_name:
                return m
        return None

    # ── state ────────────────────────────────────────────────────────────

    def current(self) -> dict:
        if self._pollinator is None:
            return {"model_name": None, "embedding_hash": None, "vocab_size": None}
        return {
            "model_name": self._pollinator.model_name,
            "embedding_hash": self._embedding_hash,
            "vocab_size": self._vocab_size,
        }

    def download_status(self) -> dict:
        with self._status_lock:
            status = dict(self._status)
            expected = self._expected_bytes.get(status.get("model_name") or "")
        if status["state"] == "downloading" and expected:
            downloaded = _disk_progress_bytes(status["model_name"])
            status["progress"] = min(1.0, downloaded / expected)
        return status

    def _set_status(self, **fields) -> None:
        with self._status_lock:
            self._status = {**self._status, **fields}

    def is_generating(self) -> bool:
        return self._generating

    def mark_generation_start(self) -> None:
        self._generating = True

    def mark_generation_end(self) -> None:
        self._generating = False

    # ── download ─────────────────────────────────────────────────────────

    def _ensure_downloaded(self, model_name: str) -> None:
        """snapshot_download is idempotent — if everything's already cached
        it returns almost immediately and disk-progress polling reports
        completion right away, so there's no separate 'already cached'
        fast path to special-case here."""
        self._set_status(state="downloading", progress=0.0, model_name=model_name, error=None)
        try:
            total = _compute_expected_bytes(model_name)
            with self._status_lock:
                self._expected_bytes[model_name] = total
            _check_disk_space(total)

            from huggingface_hub import snapshot_download

            snapshot_download(model_name, allow_patterns=ALLOW_PATTERNS)
        except Exception as e:
            self._set_status(state="absent", progress=0.0, error=str(e))
            raise ModelNotAvailableError(str(e)) from e

        self._set_status(state="loading", progress=1.0, error=None)

    # ── load / switch / unload ──────────────────────────────────────────

    def switch(self, model_name: str):
        """Unload whatever's resident and load model_name. Blocking — a
        cold model can take minutes to download; call via run_in_executor,
        never directly from an async route."""
        with self._lock:
            if self._generating:
                raise RegistryBusyError()
            if self._pollinator is not None and self._pollinator.model_name == model_name:
                self._set_status(state="ready", progress=1.0, model_name=model_name, error=None)
                return self._pollinator  # already the resident model

            entry = self._asset_entry(model_name)
            if entry is None:
                raise ModelNotAvailableError(
                    f"{model_name} has no built assets — run build_assets.py before offering it"
                )

            self._unload_locked()
            self._ensure_downloaded(model_name)

            # Imported here rather than at module top — see module docstring.
            from .pollinator import Pollinator

            pollinator = Pollinator(model_name)
            embedding_hash = hashlib.sha256(pollinator.embedding_matrix.tobytes()).hexdigest()[:16]

            if embedding_hash != entry["embedding_hash"]:
                # Belt-and-suspenders alongside the frontend's own
                # assertAssetsMatchModel check: fail here, at load time,
                # with a clear cause, rather than only downstream once a
                # map has already rendered against the wrong vocabulary.
                self._pollinator = None
                message = (
                    f"{model_name}: loaded embedding hash {embedding_hash} does not match "
                    f"its built assets ({entry['embedding_hash']}) — rebuild with "
                    f"`python build_assets.py --models {model_name} --force`"
                )
                self._set_status(state="absent", progress=0.0, error=message)
                raise ModelNotAvailableError(message)

            self._pollinator = pollinator
            self._embedding_hash = embedding_hash
            self._vocab_size = entry["vocab_size"]
            self._set_status(state="ready", progress=1.0, model_name=model_name, error=None)
            return pollinator

    def ensure_loaded(self, model_name: str | None):
        """Resolve which model a request should run against and make sure
        it's the one resident, loading/switching only if needed."""
        if model_name is None:
            if self._pollinator is None:
                raise NoModelLoadedError("no model is loaded yet and no model_name was given")
            return self._pollinator
        return self.switch(model_name)

    def _unload_locked(self) -> None:
        """Caller must hold self._lock."""
        if self._pollinator is None:
            return
        self._pollinator = None
        self._embedding_hash = None
        self._vocab_size = None
        gc.collect()
        try:
            import mlx.core as mx

            # mx.clear_cache() is the current API; mx.metal.clear_cache()
            # is the older one it replaced, kept as a fallback for older
            # mlx versions rather than assumed gone.
            if hasattr(mx, "clear_cache"):
                mx.clear_cache()
            elif hasattr(mx, "metal"):
                mx.metal.clear_cache()
        except ImportError:
            pass
