# -*- mode: python ; coding: utf-8 -*-
#
# Builds pollen.app — see scripts/build_release.sh for the full release
# chain (frontend build -> this -> DMG). Run directly with:
#   pyinstaller pollen.spec
#
# Checked in rather than driven by command-line flags: this config is too
# long for a one-liner and needs to be reproducible build to build.
import re
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

ROOT = Path(SPECPATH)  # noqa: F821 — SPECPATH is injected by PyInstaller

VERSION = re.search(r'^version\s*=\s*"([^"]+)"', (ROOT / "pyproject.toml").read_text(), re.MULTILINE).group(1)

# collect_all, not collect_data_files — the difference is whether the
# .dylib/.metallib Metal shader files come along. Without them the app
# builds fine, launches fine, and dies at first generation with
# "Failed to load the default metallib". This is the single most likely
# failure of the whole build and it's invisible until a token actually
# generates.
mlx_datas, mlx_binaries, mlx_hiddenimports = collect_all("mlx")
mlx_lm_datas, mlx_lm_binaries, mlx_lm_hiddenimports = collect_all("mlx_lm")
numpy_datas, numpy_binaries, numpy_hiddenimports = collect_all("numpy")

a = Analysis(
    [str(ROOT / "packaging" / "gui_entry.py")],
    pathex=[str(ROOT / "src")],  # src/-layout package — not importable without this
    binaries=mlx_binaries + mlx_lm_binaries + numpy_binaries,
    datas=[
        # Flat destination paths, not nested under "pollen/": resource_dir()
        # in frozen mode returns sys._MEIPASS directly, and every caller
        # does resource_dir() / "assets" (or "web") — matching exactly how
        # assets/ and web/ sit as siblings of paths.py in dev mode.
        (str(ROOT / "src" / "pollen" / "assets"), "assets"),
        (str(ROOT / "src" / "pollen" / "web"), "web"),
    ]
    + mlx_datas
    + mlx_lm_datas
    + numpy_datas,
    hiddenimports=[
        # uvicorn loads these dynamically (protocol/loop auto-selection) —
        # PyInstaller's static analysis can't trace them on its own.
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
    ]
    + mlx_hiddenimports
    + mlx_lm_hiddenimports
    + numpy_hiddenimports,
    # Only build_assets.py / bake_gallery.py (dev-only, never bundled) need
    # these — pulling them into the runtime bundle would add hundreds of MB
    # for code that never runs here.
    excludes=["sklearn", "umap", "numba", "llvmlite", "matplotlib", "pytest", "IPython", "notebook"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    exclude_binaries=True,
    name="pollen",
    console=False,  # no terminal window — errors go to a native alert instead (see cli.py)
)

# One-dir (COLLECT), not one-file: one-file unpacks to a temp dir on every
# launch, which with a ~400MB bundle means a slow start every time.
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    # UPX-compressing Mach-O dylibs (especially Metal-related ones) is a
    # known source of silent corruption on macOS PyInstaller builds — cheap
    # insurance to disable it outright rather than debug it later.
    upx=False,
    name="pollen",
)

app = BUNDLE(
    coll,
    name="pollen.app",
    icon=str(ROOT / "packaging" / "pollen.icns"),
    bundle_identifier="com.pollen.app",
    info_plist={
        "CFBundleName": "pollen",
        "CFBundleShortVersionString": VERSION,
        "CFBundleVersion": VERSION,
        "NSHighResolutionCapable": True,
        # MLX's own floor — the app can't do anything real below this.
        "LSMinimumSystemVersion": "14.0",
        "LSBackgroundOnly": False,
    },
)
