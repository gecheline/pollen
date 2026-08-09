"""Synthetic SSE frames — no MLX, no model required.

Lets the frontend and the SSE transport in main.py be built and tested on
any machine. Frame shapes match pollinator.generate_interleaved's real
output exactly (see the contract in schemas.py) — main.py's event loop
doesn't know or care which generator produced them.

Enabled via POST /api/chat?fixtures=1 or the POLLEN_FIXTURES=1 env var.
"""

from __future__ import annotations

import json
import random
import time
from pathlib import Path
from typing import Iterator

from .paths import resource_dir
from .schemas import ChatRequest

_HERE = resource_dir()
_MODELS_JSON = _HERE / "assets" / "models.json"
_FALLBACK_VOCAB_SIZE = 32000  # used only if models.json is missing or the model isn't listed

_STEP_DELAY_S = 0.02  # paces the stream so reveal/streaming code paths are actually exercised

_WORD_BANK = (
    "the model considers several plausible continuations here weighing evidence "
    "against intuition and circling back to what the question actually asked "
    "before committing to a direction that feels earned rather than assumed "
    "there is a pattern worth noticing in how attention shifts from concrete "
    "detail toward abstraction and then grounds itself again in a specific "
    "example that carries the weight of everything said so far without "
    "needing to restate it plainly each sentence either extends the last "
    "thought or quietly revises it and the difference between those two "
    "moves is often where a lens shows its hand most clearly"
).split()


def _lookup_vocab_size(model_name: str | None) -> int:
    try:
        data = json.loads(_MODELS_JSON.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return _FALLBACK_VOCAB_SIZE
    models = data.get("models", [])
    if model_name:
        for m in models:
            if m.get("model_name") == model_name:
                return m["vocab_size"]
    return models[0]["vocab_size"] if models else _FALLBACK_VOCAB_SIZE


def _make_sentence(rng: random.Random, n_words: int) -> list[str]:
    words = [rng.choice(_WORD_BANK) for _ in range(n_words)]
    tokens = [words[0]] + [" " + w for w in words[1:]]
    tokens[-1] = tokens[-1] + "."
    return tokens


def _bounded_walk(rng: random.Random, n: int, start: float, lo: float, hi: float, step: float) -> list[float]:
    v = start
    out = []
    for _ in range(n):
        v = max(lo, min(hi, v + (rng.random() - 0.5) * step))
        out.append(v)
    return out


def _inject_diagnostic_cases(rng: random.Random, log_ratio: list[float], kl: list[float]) -> None:
    """Force one thin-far-from-zero and one thick-near-zero excursion, in
    place, so both channels the trace exists to distinguish are visible in
    every fixture run rather than only sometimes, by chance."""
    n = len(log_ratio)
    if n < 6:
        return
    i_thin = max(1, min(n - 2, n // 3))
    i_thick = max(1, min(n - 2, (2 * n) // 3))
    if i_thick == i_thin:
        i_thick = min(n - 2, i_thin + 1)

    def sign() -> float:
        return 1.0 if rng.random() < 0.5 else -1.0

    log_ratio[i_thin] = sign() * (2.3 + rng.random() * 0.5)
    kl[i_thin] = 0.03 + rng.random() * 0.05
    log_ratio[i_thick] = sign() * (rng.random() * 0.08)
    kl[i_thick] = 2.5 + rng.random() * 0.45


def generate_fixture_frames(request: ChatRequest) -> Iterator[dict]:
    vocab_size = _lookup_vocab_size(request.model_name)

    lens_panel_ids = [f"lens_{i}" for i in range(len(request.lenses))]
    panel_ids = ["baseline"] + lens_panel_ids
    if len(request.lenses) >= 2:
        panel_ids.append("mixed")

    # Deterministic per (session, message, lens set) so repeated identical
    # requests reproduce the same fixture — handy while developing.
    seed_base = abs(hash((request.session_id, request.user_message, tuple(l.id for l in request.lenses))))

    rngs = {pid: random.Random(seed_base + idx * 7919) for idx, pid in enumerate(panel_ids)}
    tokens = {pid: _make_sentence(rngs[pid], rngs[pid].randint(28, 46)) for pid in panel_ids}

    surprisal = {pid: _bounded_walk(rngs[pid], len(tokens[pid]), 1.0, 0.1, 4.5, 1.1) for pid in panel_ids}

    log_ratio: dict[str, list[float]] = {}
    kl: dict[str, list[float]] = {}
    for pid in panel_ids:
        if pid == "baseline":
            continue
        n = len(tokens[pid])
        lr = _bounded_walk(rngs[pid], n, 0.0, -3.2, 3.2, 1.4)
        kv = _bounded_walk(rngs[pid], n, 0.4, 0.02, 3.0, 1.0)
        _inject_diagnostic_cases(rngs[pid], lr, kv)
        log_ratio[pid] = lr
        kl[pid] = kv

    dominant_lens: list[str] = []
    if "mixed" in panel_ids:
        rng = rngs["mixed"]
        n = len(tokens["mixed"])
        i = 0
        pool = lens_panel_ids or ["baseline"]
        while i < n:
            run_len = min(n - i, 2 + rng.randrange(4))
            dominant_lens.extend([rng.choice(pool)] * run_len)
            i += run_len

    cursor = {pid: 0 for pid in panel_ids}
    live = set(panel_ids)
    max_len = max(len(t) for t in tokens.values())

    for _ in range(max_len):
        for pid in list(live):
            i = cursor[pid]
            panel_tokens = tokens[pid]
            if i >= len(panel_tokens):
                live.discard(pid)
                yield {"type": "panel_done", "panel_id": pid, "text": "".join(panel_tokens)}
                continue

            rng = rngs[pid]
            frame: dict = {
                "type": "token",
                "panel_id": pid,
                "token": panel_tokens[i],
                "token_id": rng.randrange(vocab_size),
                "surprisal": round(surprisal[pid][i], 4),
                "activations": [
                    {"pointIndex": rng.randrange(vocab_size), "strength": round(rng.uniform(0.15, 1.0), 4)}
                    for _ in range(1 + rng.randrange(4))
                ],
            }
            if pid != "baseline":
                frame["logRatio"] = round(log_ratio[pid][i], 4)
                frame["kl"] = round(kl[pid][i], 4)
            if pid == "mixed":
                frame["dominantLensId"] = dominant_lens[i]

            cursor[pid] += 1
            yield frame
            time.sleep(_STEP_DELAY_S)

    for pid in list(live):
        yield {"type": "panel_done", "panel_id": pid, "text": "".join(tokens[pid])}
