#!/usr/bin/env python3
"""Generates packaging/pollen.icns from scratch.

Not part of the release chain (build_release.sh doesn't call this) — the
icon is a committed build input, same as src/pollen/assets/ or web/, and
only needs regenerating if the design itself changes. Run by hand:

    python3 packaging/make_icon.py

Draws a small rosette of the app's own lens accent colors on its cream
background — the same palette and motif as the vocab-map visualization —
rather than inventing unrelated iconography, then shells out to the stock
macOS tools (sips, iconutil) to produce the .iconset sizes and compile the
final .icns. No new dependency beyond Pillow, already used elsewhere.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent

# Same palette as frontend/src/App.tsx's LENS_UI / BASELINE_ACCENT and
# frontend/src/index.css's light-mode --surface.
BACKGROUND = "#edeae0"
BASELINE_ACCENT = "#8a8480"
LENS_COLORS = [
    "#7b5ea7",  # scientist
    "#4a7a7a",  # philosopher
    "#b06090",  # poet
    "#c07060",  # skeptic
    "#5a7a5a",  # naturalist
]

MASTER_SIZE = 1024
# Apple's stock macOS "squircle" mask crops close to the edge — keep the
# design inside a generous margin so nothing looks clipped.
MARGIN = 140

ICONSET_SIZES = [16, 32, 128, 256, 512]  # each also gets an @2x


def draw_master() -> Image.Image:
    img = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), BACKGROUND)
    draw = ImageDraw.Draw(img, "RGBA")

    cx = cy = MASTER_SIZE / 2
    inner = (MASTER_SIZE - 2 * MARGIN) / 2

    def dot(x: float, y: float, r: float, color: str, alpha: int = 255) -> None:
        fill = tuple(int(color[i : i + 2], 16) for i in (1, 3, 5)) + (alpha,)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)

    # Baseline: the reference, center and largest.
    dot(cx, cy, inner * 0.30, BASELINE_ACCENT)

    # Lenses: a loose ring around it, varying size/opacity the way surprisal
    # varies weight/opacity on the real vocab map.
    import math

    n = len(LENS_COLORS)
    ring_r = inner * 0.62
    for i, color in enumerate(LENS_COLORS):
        angle = (2 * math.pi * i / n) - math.pi / 2
        x = cx + ring_r * math.cos(angle)
        y = cy + ring_r * math.sin(angle)
        size = inner * (0.22 + 0.05 * (i % 2))
        dot(x, y, size, color, alpha=235)

    return img


def build_iconset(master: Image.Image, iconset_dir: Path) -> None:
    iconset_dir.mkdir(parents=True, exist_ok=True)
    for size in ICONSET_SIZES:
        master.resize((size, size), Image.LANCZOS).save(iconset_dir / f"icon_{size}x{size}.png")
        master.resize((size * 2, size * 2), Image.LANCZOS).save(iconset_dir / f"icon_{size}x{size}@2x.png")


def main() -> int:
    if sys.platform != "darwin":
        print("make_icon.py needs iconutil, which is macOS-only.", file=sys.stderr)
        return 1
    if shutil.which("iconutil") is None:
        print("iconutil not found — this needs to run on macOS with Xcode command line tools.", file=sys.stderr)
        return 1

    master = draw_master()
    iconset_dir = HERE / "pollen.iconset"
    if iconset_dir.exists():
        shutil.rmtree(iconset_dir)
    build_iconset(master, iconset_dir)

    out = HERE / "pollen.icns"
    subprocess.run(["iconutil", "-c", "icns", str(iconset_dir), "-o", str(out)], check=True)
    shutil.rmtree(iconset_dir)
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
