# pollen

```
uvx --from git+https://github.com/gecheline/pollen pollen
```

That starts a local server and opens a browser tab. No Node.js, no manual setup.

## Requirements

- **Apple Silicon Mac** (M1 or later) — pollen runs models locally via MLX, which is Metal-only
- **Python 3.10+**
- **~5GB free disk** per model, downloaded once on first use and cached by Hugging Face

Everything else — [uv](https://docs.astral.sh/uv/)/`uvx`, the Python dependencies, the model weights — is handled for you.

## What it is

pollen asks one question through several "lenses" — personas layered onto the same underlying model via system prompt — and shows, token by token, how much each lens's answer diverges from a plain baseline answer to the same question. Color is which lens; line weight is how surprising a word was to that lens; the ribbon's thickness is how far that lens's whole distribution over next words differed from the baseline's, not just the one word it picked.

![pollen: four panels comparing a baseline answer against Poet and Naturalist lenses and their blended Mixed panel, each with a vocabulary map and a divergence trace](docs/screenshot.jpg)

## First run

The first time you pick a model, pollen downloads it (a few GB, a few minutes depending on your connection) and shows real download progress — not a spinner. Every run after that is fast, because the download is cached on disk (`~/.cache/huggingface`) and reused.

## Gallery

<!-- TODO: step C — link to the hosted gallery of curated runs -->

## Development

Source lives in `frontend/` (React + Vite + TypeScript) and `src/pollen/` (FastAPI + MLX). They run as two separate servers in dev, talking through Vite's proxy:

```bash
# terminal 1 — backend, port 8000
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[build]"
uvicorn pollen.main:app --reload --port 8000

# terminal 2 — frontend, port 8443, proxies /api and /assets to :8000
cd frontend
npm install
npm run dev
```

The frontend only ever calls relative paths (`/api/...`, `/assets/...`) — never an absolute `localhost` URL — so the same code works unmodified whether Vite's dev proxy is in front of it or FastAPI is serving it directly in the packaged app.

Before a release, rebuild the frontend into the package and commit the result — `uvx --from git+...` builds straight from the git checkout with no build step of its own, so `src/pollen/web/` has to already be up to date in the repo:

```bash
./scripts/build_web.sh
```

## Rebuilding assets

The vocabulary maps (`src/pollen/assets/`) are precomputed per model — PCA to 50D, then UMAP to 2D, over that model's embedding table — and shipped in the package so nobody needs a GPU cluster to see one. Rebuilding them needs the `build` extra:

```bash
pip install -e ".[build]"
python -m pollen.build_assets
```

This loads each model, runs UMAP over its full vocabulary, and writes coords + a manifest per model. Expect it to take **hours**, not minutes, especially for larger vocabularies — it's a one-time (or per-release) job, not something to run casually.
