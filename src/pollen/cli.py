"""`pollen` — the console-script entry point.

    pollen                  start, open a browser
    pollen --port 8931      override the starting port (still increments if taken)
    pollen --no-browser
    pollen --model <id>     sets POLLEN_DEFAULT_MODEL, read by GET /api/models
    pollen --fixtures       sets POLLEN_FIXTURES=1 — synthetic frames, no MLX/model needed

Ordering matters here: platform/version/asset checks all run, and fail with
a short human message on stderr, before `pollen.main` (and therefore
fastapi/uvicorn) is ever imported — a broken install or wrong machine should
never surface as a Python traceback.
"""

from __future__ import annotations

import argparse
import os
import platform
import socket
import sys
import threading
import time
from pathlib import Path


def _check_python_version() -> None:
    if sys.version_info < (3, 10):
        print(f"pollen requires Python 3.10+ — this is {sys.version.split()[0]}.", file=sys.stderr)
        sys.exit(1)


def _check_platform() -> None:
    """Skipped entirely in --fixtures mode: fixtures need no MLX and no
    Apple Silicon, and are the whole point of the flag on other hardware."""
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        print(
            "pollen requires an Apple Silicon Mac to run real models — this "
            f"machine reports {platform.system()}/{platform.machine()}. Use "
            "--fixtures for a synthetic-data preview on other hardware.",
            file=sys.stderr,
        )
        sys.exit(1)


def _check_assets() -> None:
    models_json = Path(__file__).resolve().parent / "assets" / "models.json"
    if not models_json.exists():
        print(
            "pollen: no built vocab-map assets found in this install — it looks "
            "corrupted or incomplete. Try reinstalling:\n"
            "  uvx --from git+https://github.com/<org>/pollen pollen",
            file=sys.stderr,
        )
        sys.exit(1)


def _find_free_port(start: int, host: str = "127.0.0.1", max_tries: int = 20) -> int:
    """Probes real bind()s starting at `start`, incrementing past anything
    already taken. There's a small window between this check and uvicorn's
    own bind where another process could grab the same port — acceptable
    for a local single-user dev tool, not worth a more elaborate handoff."""
    port = start
    for _ in range(max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, port))
                return port
            except OSError:
                port += 1
    print(f"pollen: couldn't find a free port starting at {start} after {max_tries} tries.", file=sys.stderr)
    sys.exit(1)


def _open_browser_when_ready(port: int, timeout: float = 60.0) -> None:
    """Runs on a daemon thread alongside uvicorn.run() in the main thread.
    Opens the browser on the first real 200 from /api/health, not a fixed
    sleep — the first request after a cold start can be slow (module
    imports, asset reads), and a fixed delay is either too short (blank tab)
    or too long (dead air) depending on the machine."""
    import urllib.request
    import webbrowser

    url = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"{url}/api/health", timeout=1) as resp:
                if resp.status == 200:
                    webbrowser.open(url)
                    return
        except Exception:
            pass
        time.sleep(0.2)
    # Server never came up in time — say nothing here; the foreground
    # uvicorn process owns reporting why, and it's still running.


def _parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="pollen", description="Compare how lenses change an LLM's answer, locally.")
    ap.add_argument("--port", type=int, default=8931, help="starting port (default: 8931; increments if taken)")
    ap.add_argument("--no-browser", action="store_true", help="don't open a browser tab on startup")
    ap.add_argument("--model", default=None, help="model to preselect (must be one of the built assets)")
    ap.add_argument("--fixtures", action="store_true", help="synthetic data, no MLX/model required")
    return ap.parse_args()


def main() -> None:
    args = _parse_args()

    _check_python_version()
    if not args.fixtures:
        _check_platform()
        _check_assets()

    if args.model:
        os.environ["POLLEN_DEFAULT_MODEL"] = args.model
    if args.fixtures:
        os.environ["POLLEN_FIXTURES"] = "1"

    port = _find_free_port(args.port)

    if not args.no_browser:
        threading.Thread(target=_open_browser_when_ready, args=(port,), daemon=True).start()

    print(f"pollen: http://127.0.0.1:{port}  (Ctrl-C to stop)")

    # Imported here, not at module top — keeps `pollen --help` and the
    # preflight checks above fast and dependency-light even if fastapi/
    # uvicorn somehow failed to install correctly.
    import uvicorn

    from .main import app

    try:
        uvicorn.run(app, host="127.0.0.1", port=port, reload=False, log_level="warning")
    except KeyboardInterrupt:
        pass
    print("pollen: stopped")


if __name__ == "__main__":
    main()
