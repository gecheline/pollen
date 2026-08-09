#!/usr/bin/env bash
# Wraps dist/pollen.app (built by `pyinstaller pollen.spec`) into
# dist/pollen-<version>.dmg — a plain Finder window with the app and an
# /Applications symlink, per the packaging spec (no custom background).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v create-dmg >/dev/null 2>&1; then
  echo "build_dmg.sh: create-dmg not found — install it with:" >&2
  echo "  brew install create-dmg" >&2
  exit 1
fi

APP="dist/pollen.app"
if [ ! -d "$APP" ]; then
  echo "build_dmg.sh: $APP doesn't exist — run 'pyinstaller pollen.spec' first" >&2
  exit 1
fi

VERSION=$(grep -m1 '^version' pyproject.toml | sed -E 's/version *= *"(.*)"/\1/')
OUT="dist/pollen-${VERSION}.dmg"

rm -f "$OUT"

create-dmg \
  --volname "pollen" \
  --window-size 540 380 \
  --icon-size 128 \
  --icon "pollen.app" 140 170 \
  --hide-extension "pollen.app" \
  --app-drop-link 400 170 \
  "$OUT" \
  "$APP"

echo "wrote $OUT"
