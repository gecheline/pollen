#!/usr/bin/env python3
"""
bake_gallery.py — turn saved captures into the static gallery payload.

Does NO generation. Reads gallery.manifest.json, loads the captures it points
at, splits each capture's frame stream into one file per panel, and writes an
index the gallery frontend reads. Fast and re-runnable: iterate on the manifest
copy and re-bake without touching a model.

Lives in src/pollen/ alongside build_assets.py, but reads and writes at repo
level: captures/ for input, frontend/public-gallery/ for output. Both are found
by walking up to the directory containing frontend/ and src/.

Output (default <repo>/frontend/public-gallery):

    index.json
    <card-id>/turn<N>/<panel-id>.json

Usage:
    python bake_gallery.py
    python bake_gallery.py --cards art universe
    python bake_gallery.py --out ../frontend/public-gallery
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

_HERE = Path(__file__).resolve().parent


def _repo_root() -> Path:
    """Walk up until we find the dir holding both frontend/ and src/.

    This script lives inside the package (src/pollen/), but its inputs and
    outputs are repo-level (captures/, frontend/public-gallery/). Searching
    upward keeps it correct if the layout shifts again, instead of hardcoding
    how many levels to climb.
    """
    for d in [_HERE, *_HERE.parents]:
        if (d / "frontend").is_dir() and (d / "src").is_dir():
            return d
    return _HERE.parent.parent


_ROOT = _repo_root()
DEFAULT_MANIFEST = _HERE / "gallery.manifest.json"
DEFAULT_OUT = _ROOT / "frontend" / "public-gallery"
DEFAULT_CAPTURES = _ROOT / "captures"

GALLERY_FORMAT_VERSION = 1


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def load_capture(path: Path) -> dict:
    if not path.exists():
        die(f"capture not found: {path}")
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as e:
        die(f"capture is not valid JSON: {path}\n  {e}")


def split_panels(capture: dict) -> dict[str, dict]:
    """Frame stream -> one record per panel, as parallel arrays.

    Parallel arrays rather than an array of objects: same information, smaller,
    and it gzips better. Field presence follows the live SSE contract exactly —
    baseline has no logRatio/kl, only mixed has dominantLensId — so a gallery
    panel and a live panel feed the components identically.
    """
    panels: dict[str, dict] = defaultdict(
        lambda: {
            "tokens": [],
            "token_ids": [],
            "surprisal": [],
            "logRatio": [],
            "kl": [],
            "dominantLensId": [],
            "activations": [],
            "text": "",
        }
    )

    for frame in capture["frames"]:
        ftype = frame.get("type")
        if ftype == "token":
            p = panels[frame["panel_id"]]
            p["tokens"].append(frame.get("token", ""))
            p["token_ids"].append(frame.get("token_id"))
            p["surprisal"].append(frame.get("surprisal"))
            p["activations"].append(frame.get("activations", []))
            if "logRatio" in frame:
                p["logRatio"].append(frame["logRatio"])
            if "kl" in frame:
                p["kl"].append(frame["kl"])
            if "dominantLensId" in frame:
                p["dominantLensId"].append(frame["dominantLensId"])
        elif ftype == "panel_done":
            panels[frame["panel_id"]]["text"] = frame.get("text", "")

    out = {}
    for pid, p in panels.items():
        rec = {
            "panel_id": pid,
            "n_tokens": len(p["tokens"]),
            "tokens": p["tokens"],
            "token_ids": p["token_ids"],
            "surprisal": p["surprisal"],
            "activations": p["activations"],
            "text": p["text"],
        }
        # Only emit the trace fields that actually exist. Baseline legitimately
        # has none — Panel.tsx flattens it itself, and sending zeros would make
        # a real zero indistinguishable from an absent measurement.
        if p["logRatio"]:
            rec["logRatio"] = p["logRatio"]
        if p["kl"]:
            rec["kl"] = p["kl"]
        if p["dominantLensId"]:
            rec["dominantLensId"] = p["dominantLensId"]
        out[pid] = rec
    return out


def lens_meta(capture: dict) -> list[dict]:
    """Panel id -> display name, for the rail. Custom lenses carry their own
    system_prompt in the capture, so nothing needs a preset lookup."""
    return [
        {
            "panel_id": f"lens_{i}",
            "lens_id": lens["id"],
            "name": lens["name"],
            "system_prompt": lens.get("system_prompt", ""),
            "weight": lens.get("weight", 1.0),
        }
        for i, lens in enumerate(capture["request"]["lenses"])
    ]


def bake_card(card: dict, captures_dir: Path, out_root: Path, manifest: dict) -> dict:
    card_id = card["id"]
    card_dir = out_root / card_id
    if card_dir.exists():
        shutil.rmtree(card_dir)
    card_dir.mkdir(parents=True)

    show_mixed = card.get("show_mixed", True)
    turns_out = []
    session_ids = set()
    first_lenses = None
    total_bytes = 0

    for turn_index, turn in enumerate(card["turns"]):
        cap_path = captures_dir / turn["capture"]
        capture = load_capture(cap_path)
        req = capture["request"]

        if capture.get("embedding_hash") == "fixtures":
            die(f"{card_id} turn {turn_index}: capture was made in fixtures mode "
                f"and cannot be shipped ({turn['capture']})")

        if capture.get("model_name") != manifest["model_name"]:
            die(f"{card_id} turn {turn_index}: capture model {capture.get('model_name')!r} "
                f"!= manifest model {manifest['model_name']!r} ({turn['capture']})")

        session_ids.add(req.get("session_id"))

        lenses = lens_meta(capture)
        if first_lenses is None:
            first_lenses = lenses
        elif [l["lens_id"] for l in lenses] != [l["lens_id"] for l in first_lenses]:
            die(f"{card_id} turn {turn_index}: lens set changes mid-conversation "
                f"({turn['capture']}) — the rail would shift between turns")

        panels = split_panels(capture)
        if not show_mixed:
            panels.pop("mixed", None)

        turn_dir = card_dir / f"turn{turn_index}"
        turn_dir.mkdir()

        panel_files = {}
        for pid, rec in panels.items():
            fp = turn_dir / f"{pid}.json"
            fp.write_text(json.dumps(rec, ensure_ascii=False, separators=(",", ":")))
            panel_files[pid] = f"{card_id}/turn{turn_index}/{pid}.json"
            total_bytes += fp.stat().st_size

        turns_out.append({
            "index": turn_index,
            "user_message": req["user_message"],
            "combine_mode": req.get("combine_mode"),
            "weight_mode": req.get("weight_mode"),
            "panels": panel_files,
            "n_tokens": {pid: rec["n_tokens"] for pid, rec in panels.items()},
        })

    # Multi-turn cards must be one real conversation, or the follow-up button
    # is stitching together unrelated runs while looking continuous.
    if len(card["turns"]) > 1 and len(session_ids) > 1:
        die(f"{card_id}: turns come from {len(session_ids)} different sessions — "
            f"they are not a single conversation")

    entry = {
        "id": card_id,
        "title": card["title"],
        "subtitle": card["subtitle"],
        "image": card.get("image"),
        "layout": card["layout"],
        "show_mixed": show_mixed,
        "lenses": first_lenses,
        "turns": turns_out,
        "bytes": total_bytes,
    }
    for optional in ("explainer", "panel_order"):
        if optional in card:
            entry[optional] = card[optional]
    return entry


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", default=None, help=f"default: {DEFAULT_MANIFEST.name}")
    ap.add_argument("--out", default=None, help=f"default: {DEFAULT_OUT}")
    ap.add_argument("--cards", nargs="+", default=None, help="bake only these card ids")
    args = ap.parse_args()

    manifest_path = Path(args.manifest).resolve() if args.manifest else DEFAULT_MANIFEST
    out_root = Path(args.out).resolve() if args.out else DEFAULT_OUT
    if not manifest_path.exists():
        die(f"manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text())
    # captures_dir in the manifest is optional and, when given, is relative to
    # the manifest. Default is the repo-root captures/ folder.
    if manifest.get("captures_dir"):
        captures_dir = (manifest_path.parent / manifest["captures_dir"]).resolve()
    else:
        captures_dir = DEFAULT_CAPTURES
    if not captures_dir.is_dir():
        die(f"captures directory not found: {captures_dir}")

    out_root.mkdir(parents=True, exist_ok=True)

    sections_out = []
    grand_total = 0
    for section in manifest["sections"]:
        cards_out = []
        for card in section["cards"]:
            if args.cards and card["id"] not in args.cards:
                continue
            print(f"  {section['id']}/{card['id']} ...", flush=True)
            entry = bake_card(card, captures_dir, out_root, manifest)
            grand_total += entry["bytes"]
            print(f"      {len(entry['turns'])} turn(s), "
                  f"{len(entry['lenses'])} pollinator(s), "
                  f"{entry['bytes']/1024:.0f} KB")
            cards_out.append(entry)
        if cards_out:
            sections_out.append({
                "id": section["id"],
                "title": section["title"],
                "cards": cards_out,
            })

    # index.json is written last: a partial index pointing at files that
    # aren't there is worse than no index at all.
    index = {
        "gallery_format_version": GALLERY_FORMAT_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_name": manifest["model_name"],
        "github_url": manifest.get("github_url"),
        "footer": manifest.get("footer"),
        "sections": sections_out,
    }
    (out_root / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2))

    print(f"\nWrote {out_root}")
    print(f"  {sum(len(s['cards']) for s in sections_out)} cards, "
          f"{grand_total/1_048_576:.2f} MB of panel data")
    print("  Reminder: coords for this model must also be present in the gallery public dir.")
    return 0


if __name__ == "__main__":
    sys.exit(main())