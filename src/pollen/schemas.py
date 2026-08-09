"""Pydantic request models and the SSE frame contract.

The frame contract (see the table in the build spec, §7) isn't enforced by a
pydantic model on the way out — frames are built as plain dicts in
pollinator.py/fixtures.py and serialized with json.dumps in main.py, since
they're a streamed sequence of heterogeneous shapes, not one response body.
This module is the source of truth for what fields each frame type carries;
keep it and the dict-building code in sync by hand.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class Lens(BaseModel):
    id: str
    name: str
    system_prompt: str
    weight: float = 1.0


class ChatRequest(BaseModel):
    session_id: str
    user_message: str
    lenses: list[Lens]
    model_name: str | None = None  # None -> currently loaded model
    combine_mode: str = "common_ground"
    weight_mode: str = "equal"
    history_mode: str = "only_mixed"
    max_new_tokens: int = 600
    temperature: float = 1.0
    length_hint: str = ""  # appended to every system prompt including baseline


class ModelSwitchRequest(BaseModel):
    model_name: str


class SessionResetRequest(BaseModel):
    session_id: str


class CaptureRequest(BaseModel):
    """`request`/`frames` are deliberately untyped dicts, not ChatRequest /
    a frame union — the whole point of a capture is a byte-faithful record
    of what the frontend actually sent and received. Routing it through a
    stricter model risks silently coercing or dropping a field on the way
    to disk; a plain dict just round-trips whatever JSON came in."""

    slug: str = ""
    request: dict[str, Any]
    frames: list[dict[str, Any]]


def with_length(system_prompt: str, length_hint: str) -> str:
    """Append the length hint to a system prompt, baseline included.

    The baseline's system prompt is with_length("", hint) — the length hint
    alone, no persona — so it still writes at the requested length without
    adopting any lens's voice.
    """
    if not length_hint:
        return system_prompt
    return (system_prompt + "\n\n" + length_hint).strip()


# ── SSE frame contract ───────────────────────────────────────────────────────
#
# Every frame carries panel_id except "done".
#
#   token        panel_id, token, token_id, surprisal,
#                activations: [{pointIndex, strength}],
#                logRatio, kl        (omitted entirely for baseline)
#                dominantLensId      (mixed panel only)
#   panel_done   panel_id, text
#   error        message
#   done         (no fields)
#
# atTokenIndex is derived frontend-side from arrival order — never sent.
# Baseline omits logRatio/kl rather than sending zeros; Panel.tsx flattens
# the baseline trace itself. _token_ids is internal and never sent.
