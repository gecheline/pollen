"""`pollen`'s two entry points.

`main()` — the console-script entry point (`pip install .`, dev checkouts):

    pollen                  start, open a browser
    pollen --port 8931      override the starting port (still increments if taken)
    pollen --no-browser
    pollen --model <id>     sets POLLEN_DEFAULT_MODEL, read by GET /api/models
    pollen --fixtures       sets POLLEN_FIXTURES=1 — synthetic frames, no MLX/model needed

`gui_main()` — the PyInstaller `.app` entry point (see packaging/gui_entry.py).
Launched by double-clicking in Finder: no terminal, no argv, nobody watching
stdout. Same startup sequence as `main()`, but every failure that would
otherwise print to stderr and exit shows a native alert dialog instead —
a GUI app that dies silently on a bad launch is indistinguishable from a
broken download.

Both share one rule: checks that can fail raise StartupError with a short,
single-line, human-readable message; each entry point decides how to show
it. Platform/version/asset checks all run — and fail this way — before
`pollen.main` (and therefore fastapi/uvicorn) is ever imported, so a broken
install or wrong machine can't surface as a raw Python traceback either way.
"""

from __future__ import annotations

import argparse
import os
import platform
import socket
import subprocess
import sys
import threading
import time

from .paths import resource_dir


class StartupError(Exception):
    """Raised by anything that can fail before the server is actually up —
    preflight checks, port search, server startup itself. main() prints it
    to stderr and exits; gui_main() shows it in a native alert and exits."""


def _check_python_version() -> None:
    if sys.version_info < (3, 10):
        raise StartupError(f"pollen requires Python 3.10+ — this is {sys.version.split()[0]}.")


def _check_platform() -> None:
    """Skipped entirely in --fixtures mode: fixtures need no MLX and no
    Apple Silicon, and are the whole point of the flag on other hardware.
    (gui_main() never skips this — a double-clicked .app has no way to pass
    --fixtures, see packaging/gui_entry.py.)"""
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise StartupError(
            "pollen requires an Apple Silicon Mac to run real models — this "
            f"machine reports {platform.system()}/{platform.machine()}. Use "
            "--fixtures for a synthetic-data preview on other hardware."
        )


def _check_assets() -> None:
    models_json = resource_dir() / "assets" / "models.json"
    if not models_json.exists():
        raise StartupError(
            "pollen: no built vocab-map assets found in this install — it looks "
            "corrupted or incomplete. Try downloading a fresh copy from the "
            "Releases page."
        )


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
    raise StartupError(f"pollen: couldn't find a free port starting at {start} after {max_tries} tries.")


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
    # uvicorn process (main()) or the alert on outright failure (gui_main())
    # owns reporting why.


def _show_alert(message: str) -> None:
    """The only way anyone launching pollen.app by double-clicking (no
    attached terminal) will ever see an error. AppleScript string literals
    don't support C-style \\n escapes, so this is only ever given a single
    short line — every StartupError message is written that way."""
    escaped = message.replace("\\", "\\\\").replace('"', '\\"')
    script = f'display alert "pollen" message "{escaped}" as critical'
    subprocess.run(["osascript", "-e", script])


def _parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="pollen", description="Compare how lenses change an LLM's answer, locally.")
    ap.add_argument("--port", type=int, default=8931, help="starting port (default: 8931; increments if taken)")
    ap.add_argument("--no-browser", action="store_true", help="don't open a browser tab on startup")
    ap.add_argument("--model", default=None, help="model to preselect (must be one of the built assets)")
    ap.add_argument("--fixtures", action="store_true", help="synthetic data, no MLX/model required")
    return ap.parse_args()


def main() -> None:
    args = _parse_args()

    try:
        _check_python_version()
        if not args.fixtures:
            _check_platform()
            _check_assets()

        if args.model:
            os.environ["POLLEN_DEFAULT_MODEL"] = args.model
        if args.fixtures:
            os.environ["POLLEN_FIXTURES"] = "1"

        port = _find_free_port(args.port)
    except StartupError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

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


def gui_main() -> None:
    """Entry point for the PyInstaller .app bundle (packaging/gui_entry.py).
    No argv to parse — a double-clicked .app gets none — so this always runs
    the full real-model path: no --fixtures, no --model, default port 8931,
    browser always opened. Every failure path shows a native alert instead
    of printing, since nothing here has a terminal watching it."""
    try:
        _check_python_version()
        _check_platform()
        _check_assets()
        port = _find_free_port(8931)
    except StartupError as e:
        _show_alert(str(e))
        sys.exit(1)

    threading.Thread(target=_open_browser_when_ready, args=(port,), daemon=True).start()

    import uvicorn

    from .main import app

    try:
        uvicorn.run(app, host="127.0.0.1", port=port, reload=False, log_level="warning")
    except Exception as e:
        _show_alert(f"pollen failed to start: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
