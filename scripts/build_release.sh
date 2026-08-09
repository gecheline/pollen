#!/usr/bin/env bash
# The whole release chain, one command: frontend -> PyInstaller app -> DMG.
# A release is never half-stale because this always rebuilds every step
# fresh, in order, rather than relying on whatever happens to already be in
# dist/ or src/pollen/web/.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v pyinstaller >/dev/null 2>&1; then
  echo "build_release.sh: pyinstaller not found — install it with:" >&2
  echo "  pip install -e \".[packaging]\"" >&2
  exit 1
fi

echo "==> building frontend"
./scripts/build_web.sh

echo "==> cleaning previous build/dist"
rm -rf build dist

echo "==> running PyInstaller"
pyinstaller pollen.spec

echo "==> building DMG"
./scripts/build_dmg.sh

echo "==> done: $(ls dist/*.dmg)"
