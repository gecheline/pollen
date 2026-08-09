"""FastAPI app: routes + SSE transport.

Generation (real or fixture) is blocking work handed to a background thread;
the event loop only ever waits on a queue.Queue via run_in_executor. This is
what keeps /api/health responsive while a 600-token generation is running.
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import re
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import fixtures, model_registry, session
from .lenses import PRESET_LENSES
from .paths import resource_dir
from .schemas import CaptureRequest, ChatRequest, ModelSwitchRequest, SessionResetRequest, with_length

registry = model_registry.ModelRegistry()

_HERE = resource_dir()
ASSETS_DIR = _HERE / "assets"
WEB_DIR = _HERE / "web"

# Local curation material, not shipped assets. Deliberately NOT resolved
# next to this file — once main.py lives inside an installed package
# (site-packages/pollen/), writing there is the classic "app writes into
# its own install directory" bug: read-only in many installs, wiped on
# upgrade/reinstall. A user-writable location outside the package is the
# only correct choice for local capture files.
CAPTURES_DIR = Path.home() / ".pollen" / "captures"

# MLX binds its GPU stream to the OS thread that first touches it. Every
# mlx-touching call — loading/switching a model AND running generation —
# has to land on the same thread for the app's whole lifetime, or later
# calls fail with "There is no Stream(gpu, N) in current thread." A
# single-worker executor reuses one persistent thread for everything
# submitted to it, which is exactly that guarantee. Fixture generation
# never touches mlx, so it stays on the plain per-request thread below.
mlx_executor = ThreadPoolExecutor(max_workers=1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Nothing to do — the whole point is that startup does NOT load a model.
    yield


app = FastAPI(lifespan=lifespan)

# Dev-only: the packaged app serves the frontend from this same process
# (same-origin, no CORS needed at all), but the Vite dev server still runs
# as a separate origin proxying /api and /assets here — these origins are
# what that proxy's browser-side requests present as. Never "*": this app
# holds a model-switch route and a session store.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8443",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8443",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health / models / presets ────────────────────────────────────────────────


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/models")
async def list_models():
    current = registry.current()
    return {
        "models": registry.list_models(),
        "loaded": current["model_name"],
        # Set by `pollen --model <id>` (POLLEN_DEFAULT_MODEL env var); None
        # when unset, in which case the frontend falls back to its own
        # hardcoded default. This is the only channel --model needs — no
        # separate endpoint, no separate frontend config.
        "default": os.environ.get("POLLEN_DEFAULT_MODEL"),
    }


@app.get("/api/model/current")
async def model_current():
    return registry.current()


@app.get("/api/model/status")
async def model_status():
    """Polled while a model is downloading/loading. Cheap and responsive on
    purpose — it reads state behind its own lock, separate from the lock
    `switch()` holds for the whole download+load duration, so polling this
    never blocks on or competes with the actual work."""
    return registry.download_status()


@app.post("/api/model")
async def switch_model(req: ModelSwitchRequest):
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(mlx_executor, registry.switch, req.model_name)
    except model_registry.RegistryBusyError:
        raise HTTPException(status_code=409, detail="a generation is in progress")
    except model_registry.ModelNotAvailableError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return registry.current()


@app.get("/api/presets")
async def presets():
    return {"lenses": PRESET_LENSES}


@app.post("/api/session/reset")
async def reset_session(req: SessionResetRequest):
    session.sessions.pop(req.session_id, None)
    return {"status": "ok"}


# ── Captures ──────────────────────────────────────────────────────────────────
#
# Local curation material: the mechanism for hand-picking which runs are good
# enough to bake into the shipped gallery. Not shipped assets themselves —
# captures/ is gitignored, only what a gallery manifest later references gets
# baked in.


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:60]


def _capture_timestamp() -> tuple[str, str]:
    """(filename-safe stamp, proper ISO8601 for captured_at)."""
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H-%M-%S"), now.strftime("%Y-%m-%dT%H:%M:%SZ")


def _unique_capture_path(stamp: str, slug: str) -> Path:
    base = f"{stamp}-{slug}" if slug else stamp
    path = CAPTURES_DIR / f"{base}.json"
    if not path.exists():
        return path
    # Two saves within the same wall-clock second (same slug) would
    # otherwise collide on filename and silently overwrite one another —
    # disambiguate rather than clobber.
    n = 2
    while True:
        candidate = CAPTURES_DIR / f"{base}-{n}.json"
        if not candidate.exists():
            return candidate
        n += 1


@app.post("/api/capture")
async def save_capture(req: CaptureRequest):
    CAPTURES_DIR.mkdir(parents=True, exist_ok=True)

    # model_name/embedding_hash come from the registry, never the client —
    # they're what ties a capture to the coords it can legitimately be
    # rendered against later, and a client-supplied value is a value that
    # can be wrong. No model resident (the fixtures-testing case, since the
    # live UI always has one loaded before it can generate at all) falls
    # back to the "fixtures" sentinel the gallery baker is expected to
    # reject, rather than claiming a real model produced these frames.
    current = registry.current()
    if current["model_name"] and current["embedding_hash"]:
        model_name = current["model_name"]
        embedding_hash = current["embedding_hash"]
    else:
        model_name = req.request.get("model_name") or "fixtures"
        embedding_hash = "fixtures"

    slug = _slugify(req.slug)
    stamp, captured_at = _capture_timestamp()
    path = _unique_capture_path(stamp, slug)

    record = {
        "captured_at": captured_at,
        "model_name": model_name,
        "embedding_hash": embedding_hash,
        "slug": slug,
        "request": req.request,
        "frames": req.frames,
    }

    # Write atomically: a half-written file that still happens to parse as
    # valid JSON (truncated mid-write) is worse than one that doesn't exist
    # yet — temp file + rename is what makes that impossible to observe.
    tmp_path = path.parent / f"{path.name}.tmp-{os.getpid()}"
    tmp_path.write_text(json.dumps(record))
    os.replace(tmp_path, path)

    return {"path": f"captures/{path.name}", "bytes": path.stat().st_size}


@app.get("/api/captures")
async def list_captures():
    if not CAPTURES_DIR.exists():
        return []

    rows = []
    for path in CAPTURES_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        rows.append(
            {
                "filename": path.name,
                "captured_at": data.get("captured_at"),
                "slug": data.get("slug", ""),
                "user_message": data.get("request", {}).get("user_message", ""),
                "bytes": path.stat().st_size,
            }
        )
    rows.sort(key=lambda r: r["captured_at"] or "", reverse=True)
    return rows


# ── Chat (SSE) ────────────────────────────────────────────────────────────────


def _use_fixtures(request_flag: bool) -> bool:
    return request_flag or os.environ.get("POLLEN_FIXTURES") == "1"


def _build_panel_configs(request: ChatRequest, sess: dict):
    """Baseline/lens/mix configs, each {system_prompt, conversation, ...},
    exactly what generate_interleaved's prefill loop consumes uniformly."""
    baseline_config = {
        "system_prompt": with_length("", request.length_hint),
        "conversation": session.assemble_conversation(
            sess, "baseline", None, request.user_message, request.history_mode
        ),
    }

    lens_configs = []
    for i, lens in enumerate(request.lenses):
        panel_id = f"lens_{i}"
        lens_configs.append(
            {
                "id": panel_id,
                "system_prompt": with_length(lens.system_prompt, request.length_hint),
                "conversation": session.assemble_conversation(
                    sess, "lens", panel_id, request.user_message, request.history_mode
                ),
            }
        )

    mix_configs = None
    if len(request.lenses) >= 2:
        # Mix components track the MIXED panel's own emerging answer, not
        # each lens's independent one — same conversation for every
        # component, only the system prompt (that lens's persona) differs.
        mixed_conversation = session.assemble_conversation(
            sess, "mixed", None, request.user_message, request.history_mode
        )
        mix_configs = [
            {
                "id": f"lens_{i}",
                "weight": lens.weight,
                "system_prompt": with_length(lens.system_prompt, request.length_hint),
                "conversation": mixed_conversation,
            }
            for i, lens in enumerate(request.lenses)
        ]

    return baseline_config, lens_configs, mix_configs


def _update_session_history(sess: dict, request: ChatRequest, panel_texts: dict[str, str]) -> None:
    sess["baseline_turns"].append({"user": request.user_message, "assistant": panel_texts.get("baseline", "")})

    for i in range(len(request.lenses)):
        panel_id = f"lens_{i}"
        sess["lens_turns"].setdefault(panel_id, []).append(
            {"user": request.user_message, "assistant": panel_texts.get(panel_id, "")}
        )

    if len(request.lenses) >= 2:
        sess["mixed_turns"].append({"user": request.user_message, "assistant": panel_texts.get("mixed", "")})
    elif len(request.lenses) == 1:
        # No mixed panel to speak of — lens_0 stands in as the canonical
        # answer so `only_mixed` history still resolves to something on the
        # next turn.
        sess["mixed_turns"].append({"user": request.user_message, "assistant": panel_texts.get("lens_0", "")})


@app.post("/api/chat")
async def chat(request: ChatRequest, fixtures_flag: bool = Query(False, alias="fixtures")):
    use_fixtures = _use_fixtures(fixtures_flag)
    sess = session.get_session(request.session_id)

    if use_fixtures:
        frame_source = fixtures.generate_fixture_frames(request)
    else:
        loop = asyncio.get_event_loop()
        try:
            pollinator = await loop.run_in_executor(mlx_executor, registry.ensure_loaded, request.model_name)
        except model_registry.RegistryBusyError:
            raise HTTPException(status_code=409, detail="a generation is in progress")
        except model_registry.ModelNotAvailableError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except model_registry.NoModelLoadedError as e:
            raise HTTPException(status_code=400, detail=str(e))

        baseline_config, lens_configs, mix_configs = _build_panel_configs(request, sess)
        frame_source = pollinator.generate_interleaved(
            baseline_config=baseline_config,
            lens_configs=lens_configs,
            mix_configs=mix_configs,
            combine_mode=request.combine_mode,
            weight_mode=request.weight_mode,
            max_new_tokens=request.max_new_tokens,
            temperature=request.temperature,
        )

    registry.mark_generation_start()

    async def event_stream():
        q: queue.Queue = queue.Queue()
        panel_texts: dict[str, str] = {}

        def run_generation() -> None:
            try:
                for frame in frame_source:
                    if frame["type"] == "panel_done":
                        panel_texts[frame["panel_id"]] = frame.get("text", "")
                    q.put(("event", frame))
                _update_session_history(sess, request, panel_texts)
            except Exception as e:
                q.put(
                    (
                        "event",
                        {"type": "error", "message": str(e), "traceback": traceback.format_exc()},
                    )
                )
            finally:
                registry.mark_generation_end()
                q.put(None)

        if use_fixtures:
            threading.Thread(target=run_generation, daemon=True).start()
        else:
            # Must run on mlx_executor's single persistent thread — the
            # same one that loaded the model above — not a fresh thread.
            mlx_executor.submit(run_generation)

        loop = asyncio.get_event_loop()
        while True:
            item = await loop.run_in_executor(None, q.get)
            if item is None:
                yield 'data: {"type": "done"}\n\n'
                break
            _, frame = item
            yield f"data: {json.dumps(frame)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── Same-origin static serving ───────────────────────────────────────────────
#
# Must be the last things registered. A Mount matches every path under its
# prefix, and "/" is a prefix of everything — if either of these mounts were
# registered before the /api/* routes above, or before each other in the
# wrong order, they'd shadow whatever comes after them completely (Starlette
# matches routes/mounts in registration order, first match wins). /assets
# before /, / always last.


class SPAStaticFiles(StaticFiles):
    """Bare StaticFiles(html=True) serves index.html for "/" but 404s on any
    other unknown path. A single-page app needs unknown paths to fall back
    to index.html too, so client-side routing (if this app ever grows any)
    doesn't depend on the server knowing its routes."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

if WEB_DIR.exists():
    app.mount("/", SPAStaticFiles(directory=WEB_DIR, html=True), name="web")
