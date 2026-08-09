"""The decode loop: prefill every panel's context, then round-robin decode
one token per live panel per step, mixing lens logits for the mixed panel
and scoring every non-baseline panel against a teacher-forced shadow of the
baseline model along that panel's own emitted tokens.

Imported lazily by model_registry (never at its module top) so the rest of
the app stays importable, and the server startable, with neither mlx nor
mlx_lm installed.
"""

from __future__ import annotations

import mlx.core as mx
import numpy as np
from mlx_lm import load
from mlx_lm.models.cache import make_prompt_cache


def _build_prompt_ids(tokenizer, system_prompt, conversation):
    # Two real per-model quirks, found by actually generating against all
    # three shipped models rather than assumed from the chat-template spec:
    #
    # - Not every template supports a system role at all. Mistral-7B-v0.3's
    #   template has no branch for it and raises immediately ("Only user and
    #   assistant roles are supported!" / "Conversation roles must
    #   alternate..."). Fall back to folding the system prompt into the
    #   first user turn rather than dropping it, and retry once.
    # - enable_thinking=False is Qwen3-specific; every other model's
    #   template simply ignores an unreferenced kwarg (extra context
    #   variables a Jinja template never reads are always harmless). Without
    #   it, Qwen3 defaults to emitting a <think>...</think> block first and
    #   burns the whole token budget on reasoning before ever reaching an
    #   answer.
    messages = [{"role": "system", "content": system_prompt}] + conversation
    try:
        text = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True, enable_thinking=False
        )
    except Exception:
        folded = list(conversation)
        first_user = folded[0]["content"] if folded and folded[0]["role"] == "user" else None
        prefix = f"{system_prompt}\n\n" if system_prompt else ""
        if first_user is not None:
            folded[0] = {"role": "user", "content": f"{prefix}{first_user}"}
        else:
            folded = [{"role": "user", "content": system_prompt}] + folded
        text = tokenizer.apply_chat_template(
            folded, tokenize=False, add_generation_prompt=True, enable_thinking=False
        )
    return mx.array(tokenizer.encode(text))


def _forward(model, input_ids, cache):
    logits = model(input_ids[None], cache=cache)
    return logits[0, -1].astype(mx.float32)


def _power_mean_mix(logit_list, alpha, weights):
    if abs(alpha) < 1e-6:
        return sum(w * lg for w, lg in zip(weights, logit_list))
    log_probs = [mx.log(mx.softmax(lg) + 1e-12) for lg in logit_list]
    log_w = [mx.log(mx.array(w)) for w in weights]
    terms = mx.stack([lw + alpha * lp for lw, lp in zip(log_w, log_probs)])
    log_unnorm = (1.0 / alpha) * mx.log(mx.sum(mx.exp(terms), axis=0))
    return log_unnorm


def _amplify_disagreement(logit_list, weights, beta=2.0, floor=1e-3):
    """Boost tokens where lenses disagree; floor keeps 'contested but live'."""
    probs_list = []
    for lg in logit_list:
        p_mx = mx.softmax(lg)
        mx.eval(p_mx)
        probs_list.append(np.array(p_mx, dtype=np.float32))
        del p_mx

    # Weighted arithmetic mean as base
    base_probs = np.zeros(probs_list[0].shape, dtype=np.float32)
    for w, p in zip(weights, probs_list):
        base_probs += w * p

    # Floor mask: at least one lens finds this token plausible
    max_probs = np.maximum.reduce(probs_list)
    floor_mask = max_probs >= floor

    # Disagreement = variance across lenses per token
    stacked = np.stack(probs_list, axis=0)
    disagree = np.var(stacked, axis=0)

    amplified = base_probs * (disagree + 1e-30) ** beta
    amplified = np.where(floor_mask, amplified, 0.0)
    amplified = amplified + 1e-30
    amplified /= amplified.sum()
    return mx.array(np.log(amplified))


def _entropy_weights(logit_list):
    """Per-token dynamic weights: softmax of negative entropies (confident lens wins)."""
    neg_entropies = []
    for lg in logit_list:
        p_mx = mx.softmax(lg)
        mx.eval(p_mx)
        p_np = np.array(p_mx, dtype=np.float32)
        del p_mx
        entropy = -float(np.sum(p_np * np.log(p_np + 1e-12)))
        neg_entropies.append(-entropy)
    ne = np.array(neg_entropies, dtype=np.float32)
    ne -= ne.max()
    exps = np.exp(ne)
    return (exps / exps.sum()).tolist()


def _sample_token(logits, temperature=1.0, top_k=50):
    logits = logits / max(temperature, 1e-8)
    if top_k > 0:
        kth = mx.partition(-logits, top_k)[top_k]
        logits = mx.where(logits < -kth, mx.full(logits.shape, -mx.inf), logits)
    return int(mx.random.categorical(logits).item())


def get_embedding_matrix(model) -> np.ndarray:
    for attr_path in (
        "model.embed_tokens",
        "model.tok_embeddings",
        "embed_tokens",
        "tok_embeddings",
    ):
        obj = model
        try:
            for part in attr_path.split("."):
                obj = getattr(obj, part)
        except AttributeError:
            continue
        # Quantized models store packed integer codes in `.weight` plus
        # separate `.scales`/`.biases` — casting the codes straight to
        # float32 gives nonsense; they must be dequantized first.
        if hasattr(obj, "scales") and hasattr(obj, "biases"):
            weight = mx.dequantize(
                obj.weight,
                scales=obj.scales,
                biases=obj.biases,
                group_size=obj.group_size,
                bits=obj.bits,
            )
        else:
            weight = obj.weight
        # Cast within MLX before ever handing the array to numpy — some
        # source dtypes (e.g. bfloat16, used for embeddings even in
        # otherwise-quantized models) don't convert cleanly through
        # numpy's buffer protocol directly.
        weight = weight.astype(mx.float32)
        mx.eval(weight)
        return np.array(weight)
    raise RuntimeError("Could not locate embedding matrix.")


def _compute_activations(probs_np, rolling_baseline, floor=1e-4, max_count=100):
    """Top-N most distinctive tokens this step, strength normalized to [0, 1].

    Distinctiveness is each token's probability relative to its own rolling EMA,
    so a token that is always likely (function words) stays dim while a token
    that spikes above its own habit lights up. Normalized per-step against the
    strongest hit so the frontend's radius math stays in range.
    """
    above = np.where(probs_np >= floor)[0]
    if len(above) == 0:
        above = np.array([int(np.argmax(probs_np))])

    scored = []
    for tid in above:
        tid = int(tid)
        prob = float(probs_np[tid])
        ema = rolling_baseline.get(tid, prob)
        distinctiveness = prob / (ema + 1e-10)
        rolling_baseline[tid] = 0.9 * ema + 0.1 * prob
        scored.append((tid, distinctiveness))

    scored.sort(key=lambda t: -t[1])
    scored = scored[:max_count]

    top = scored[0][1] if scored else 1.0
    activations = [
        {"pointIndex": tid, "strength": round(min(1.0, d / (top + 1e-10)), 4)}
        for tid, d in scored
    ]
    return activations, rolling_baseline


class Pollinator:
    def __init__(self, model_name: str):
        self.model, self.tokenizer = load(model_name)
        self.model_name = model_name
        self._embedding_matrix = None

    @property
    def embedding_matrix(self) -> np.ndarray:
        if self._embedding_matrix is None:
            self._embedding_matrix = get_embedding_matrix(self.model)
        return self._embedding_matrix

    def generate_interleaved(
        self,
        baseline_config: dict,
        lens_configs: list[dict],
        mix_configs: list[dict] | None,
        combine_mode: str = "common_ground",
        weight_mode: str = "equal",
        max_new_tokens: int = 600,
        temperature: float = 1.0,
        top_k: int = 50,
    ):
        model, tokenizer = self.model, self.tokenizer
        eos_id = tokenizer.eos_token_id
        has_mixed = bool(mix_configs) and len(mix_configs) >= 2

        panels: dict[str, dict] = {}

        # ── Prefill: baseline ────────────────────────────────────────────
        baseline_cache = make_prompt_cache(model)
        baseline_ids = _build_prompt_ids(tokenizer, baseline_config["system_prompt"], baseline_config["conversation"])
        baseline_logit = _forward(model, baseline_ids, baseline_cache)
        mx.eval(baseline_logit)
        panels["baseline"] = {
            "type": "single",
            "cache": baseline_cache,
            "logit": baseline_logit,
            "tokens": [],
            "done": False,
            "rolling_baseline": {},
        }

        # ── Prefill: lens panels, each with its own shadow ─────────────────
        # The shadow is the baseline system prompt run over the SAME
        # conversation as the panel it shadows, teacher-forced token by
        # token along that panel's own emitted tokens from here on — never
        # left free to write its own answer. See generate_interleaved's
        # decode loop below for why that distinction matters.
        for lc in lens_configs:
            cache = make_prompt_cache(model)
            ids = _build_prompt_ids(tokenizer, lc["system_prompt"], lc["conversation"])
            logit = _forward(model, ids, cache)

            shadow_cache = make_prompt_cache(model)
            shadow_ids = _build_prompt_ids(tokenizer, baseline_config["system_prompt"], lc["conversation"])
            shadow_logit = _forward(model, shadow_ids, shadow_cache)

            mx.eval(logit, shadow_logit)

            panels[lc["id"]] = {
                "type": "single",
                "cache": cache,
                "logit": logit,
                "shadow_cache": shadow_cache,
                "shadow_logit": shadow_logit,
                "tokens": [],
                "done": False,
                "rolling_baseline": {},
            }

        # ── Prefill: mixed panel (N components) + one shared shadow ────────
        # Every mix component tracks the SAME emerging mixed-panel answer —
        # only the system prompt (that lens's persona) differs between them
        # — so mix_configs[i]["conversation"] is identical across i, and the
        # mixed panel's own shadow only needs computing once from it.
        mix_lens_ids: list[str] = []
        if has_mixed:
            mix_caches, mix_logits = [], []
            for mc in mix_configs:
                cache = make_prompt_cache(model)
                ids = _build_prompt_ids(tokenizer, mc["system_prompt"], mc["conversation"])
                logit = _forward(model, ids, cache)
                mix_caches.append(cache)
                mix_logits.append(logit)
                mix_lens_ids.append(mc["id"])

            mixed_conversation = mix_configs[0]["conversation"]
            shadow_cache = make_prompt_cache(model)
            shadow_ids = _build_prompt_ids(tokenizer, baseline_config["system_prompt"], mixed_conversation)
            shadow_logit = _forward(model, shadow_ids, shadow_cache)

            mx.eval(*mix_logits, shadow_logit)

            raw_w = [mc.get("weight", 1.0) for mc in mix_configs]
            total_w = sum(raw_w) or 1.0
            equal_weights = [w / total_w for w in raw_w]

            panels["mixed"] = {
                "type": "mixed",
                "caches": mix_caches,
                "logits": mix_logits,
                "equal_weights": equal_weights,
                "shadow_cache": shadow_cache,
                "shadow_logit": shadow_logit,
                "tokens": [],
                "done": False,
                "rolling_baseline": {},
            }

        panel_order = ["baseline"] + [lc["id"] for lc in lens_configs] + (["mixed"] if has_mixed else [])

        # ── Decode ───────────────────────────────────────────────────────
        for _step in range(max_new_tokens):
            if all(panels[pid]["done"] for pid in panel_order):
                break

            for pid in panel_order:
                ps = panels[pid]
                if ps["done"]:
                    continue

                # 1. effective logit for this panel this step
                weights = None
                if ps["type"] == "single":
                    eff_logit = ps["logit"]
                else:
                    logit_list = ps["logits"]
                    weights = _entropy_weights(logit_list) if weight_mode == "confident" else ps["equal_weights"]
                    if combine_mode == "balance":
                        eff_logit = _power_mean_mix(logit_list, 1.0, weights)
                    elif combine_mode == "amplify":
                        eff_logit = _amplify_disagreement(logit_list, weights)
                    else:  # "common_ground" and any unrecognized mode
                        eff_logit = _power_mean_mix(logit_list, 0.0, weights)
                    mx.eval(eff_logit)

                # 2. sample
                token_id = _sample_token(eff_logit, temperature, top_k)
                if token_id == eos_id:
                    ps["done"] = True
                    yield {"type": "panel_done", "panel_id": pid, "text": tokenizer.decode(ps["tokens"])}
                    continue

                # 3. surprisal, via the probability of the token actually sampled
                probs_mx = mx.softmax(eff_logit)
                mx.eval(probs_mx)
                probs = np.array(probs_mx, dtype=np.float32)
                del probs_mx
                surprisal = float(-np.log(probs[token_id] + 1e-10))

                # 4. pull vs. the teacher-forced baseline shadow — skipped
                # for baseline itself, which has no shadow and nothing to
                # compare against.
                log_ratio = kl = None
                if pid != "baseline":
                    shadow_probs_mx = mx.softmax(ps["shadow_logit"])
                    mx.eval(shadow_probs_mx)
                    shadow_probs = np.array(shadow_probs_mx, dtype=np.float32)
                    del shadow_probs_mx
                    log_ratio = float(np.log(probs[token_id] + 1e-10) - np.log(shadow_probs[token_id] + 1e-10))
                    kl = float(np.sum(probs * (np.log(probs + 1e-12) - np.log(shadow_probs + 1e-12))))

                # 5. dominant-lens attribution — mixed panel only. Under
                # common_ground/balance the mixed logit is a genuine
                # (log-)weighted combination of the per-lens logits, so
                # "which lens contributed most at this token" is a direct
                # readout. Under amplify the distribution passes through a
                # variance/disagreement term first, so this is the same
                # formula but a softer claim — attribution, not a clean
                # decomposition.
                dominant_lens_id = None
                if pid == "mixed":
                    contributions = [w * float(lg[token_id].item()) for w, lg in zip(weights, logit_list)]
                    dominant_lens_id = mix_lens_ids[int(np.argmax(contributions))]

                # 6. vocab-map activations
                activations, ps["rolling_baseline"] = _compute_activations(probs, ps["rolling_baseline"])

                # token text via decode-the-whole-sequence-and-diff, not
                # decoding token_id alone — a lone id can decode ambiguously
                # (leading-space/BPE-merge artifacts) in a way the running
                # sequence resolves correctly.
                prev_text = tokenizer.decode(ps["tokens"])
                ps["tokens"].append(token_id)
                new_text = tokenizer.decode(ps["tokens"])
                token_text = new_text[len(prev_text):]

                frame = {
                    "type": "token",
                    "panel_id": pid,
                    "token": token_text,
                    "token_id": token_id,
                    "surprisal": round(surprisal, 4),
                    "activations": activations,
                }
                if pid != "baseline":
                    frame["logRatio"] = round(log_ratio, 4)
                    frame["kl"] = round(kl, 4)
                if pid == "mixed":
                    frame["dominantLensId"] = dominant_lens_id

                yield frame
                del probs

                # 7. advance every cache belonging to this panel — its own,
                # its mix components if mixed, and its shadow — issuing the
                # forward passes together and evaluating once, rather than
                # serially, since they use the same weights this step.
                next_token = mx.array([token_id])
                pending = []
                if ps["type"] == "single":
                    new_logit = _forward(model, next_token, ps["cache"])
                    pending.append(new_logit)
                else:
                    new_logits = [_forward(model, next_token, c) for c in ps["caches"]]
                    pending.extend(new_logits)
                new_shadow_logit = None
                if pid != "baseline":
                    new_shadow_logit = _forward(model, next_token, ps["shadow_cache"])
                    pending.append(new_shadow_logit)

                mx.eval(*pending)

                if ps["type"] == "single":
                    ps["logit"] = new_logit
                else:
                    ps["logits"] = new_logits
                if pid != "baseline":
                    ps["shadow_logit"] = new_shadow_logit

        # ── Flush: anything still live when max_new_tokens is exhausted ──
        for pid in panel_order:
            ps = panels[pid]
            if not ps["done"]:
                ps["done"] = True
                yield {"type": "panel_done", "panel_id": pid, "text": tokenizer.decode(ps["tokens"])}

        # ── Teardown ─────────────────────────────────────────────────────
        if hasattr(mx, "metal"):
            mx.metal.clear_cache()
