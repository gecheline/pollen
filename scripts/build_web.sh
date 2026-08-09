#!/usr/bin/env bash
# Builds the frontend to src/pollen/web/, where main.py serves it from and
# where the wheel picks it up (see pyproject.toml's force-include).
#
# This output is committed, not generated at install time: `uvx --from
# git+...` builds straight from a git checkout with no build step of its
# own, so src/pollen/web/ has to already be up to date in the repo before a
# release. Run this and commit the result whenever frontend/ changes.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
npm ci
npm run build
