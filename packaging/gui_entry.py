# PyInstaller's actual Analysis entry point (see pollen.spec) — a thin
# script rather than an importable function, since PyInstaller needs a real
# file to trace imports from. Everything it does lives in pollen.cli;
# packaging/ only exists so the source tree keeps this separate from the
# pip-installable console-script entry (pollen.cli:main).
from pollen.cli import gui_main

if __name__ == "__main__":
    gui_main()
