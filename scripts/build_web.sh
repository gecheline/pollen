#!/usr/bin/env bash
# Builds the frontend to src/pollen/web/, where main.py serves it from and
# where the packaged app (pollen.spec) picks it up as a data dir.
#
# This output is committed, not generated at install/build time: DMG builds
# (scripts/build_release.sh) and the wheel both work from whatever's
# already in the git checkout, with no separate frontend-build step of
# their own — so src/pollen/web/ has to already be up to date in the repo.
# Run this and commit the result whenever frontend/ changes.
#
# Uses pnpm, not npm: frontend/ has a pnpm-lock.yaml, no package-lock.json
# — this repo was never actually installed with npm. Pinned to the version
# frontend/.mise.toml specifies, via npx rather than corepack — corepack's
# signature verification has been flaky in this environment, and npx with
# an explicit version is simple and reproducible regardless.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
npx -y pnpm@10.34.3 install --frozen-lockfile
npx -y pnpm@10.34.3 run build
