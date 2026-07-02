# OpenVideoKit

> Scene-based video editor — Python SSR + `<hyperframes-player>` + edge-tts + MP4 export + LangGraph AI co-pilot.

OpenVideoKit is a video templating pipeline: edit slides in a web UI → Python SSR
stamps values into self-contained GSAP compositions → `<hyperframes-player>` renders
them live → edge-tts generates voiceover audio → export to MP4 via HyperFrames. A
LangGraph AI agent proposes edits (the same `EditOp`s a human dispatches) that the
user accepts or rejects — undo/redo works uniformly.

```
 ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
 │  ovk-web     │    │  Python API  │    │  Disk        │
 │  (React SPA) │    │  (FastAPI)   │    │  (per-slide) │
 │  :3000       │←──→│  :8000       │←──→│  data/       │
 │              │    │              │    │              │
 │ <hf-player>  │    │ Stamp HTML   │    │ project.json │
 │ EditBus      │    │ PUT/SSE/rev  │    │ audio-{hash} │
 │ Playhead     │    │ edge-tts     │    │ jobs/        │
 │ Captions     │    │ Render MP4   │    │ jobs.json    │
 │ AIDock       │    │ LangGraph AI │    │              │
 └──────────────┘    └──────────────┘    └──────────────┘
```

## Quickstart

```bash
git clone <this-repo>
cd openvideokit
uv sync --extra dev              # install Python deps
cp .env.example .env             # then edit .env (set OPENAI_API_KEY for AI)
cd ovk-web && pnpm install && cd ..  # install frontend deps
```

### Run the dev stack — two terminals (recommended)

`scripts/dev.sh` backgrounds both servers with `nohup`, so import errors, port
clashes, and missing-env failures are hidden in `/tmp/*.log` and the script
reports success even when a server has died. **Run each server in its own
foreground terminal instead** — you get live logs and `Ctrl-C` stops cleanly.

**Terminal 1 — Python API** (port 8000):

```bash
uv run python -m uvicorn openvideokit.app:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — Vite dev** (port 3000, proxies `/api` → `:8000):

```bash
cd ovk-web && pnpm dev -- --port 3000 --host
```

Then open `http://localhost:3000`.

- **Python API** → `http://localhost:8000`
- **Vite dev** → `http://localhost:3000` (proxies `/api` → `:8000`)
- **AI connection test** → `uv run ovk llm test`
- **Browse free models** → `uv run ovk llm free` (lists free OpenRouter models with context, reasoning, tools, uptime)

### Alternative: `scripts/dev.sh` (both servers in background)

If you prefer one command and don't need live logs:

```bash
./scripts/dev.sh                 # start both servers (background)
./scripts/dev.sh --stop          # stop both
tail -f /tmp/ovk-server.log      # API log
tail -f /tmp/ovk-vite.log        # Vite log
```

Note: the script returns immediately and servers keep running detached — check
the logs above if anything looks wrong.

## Commands

| Task | Command |
|---|---|
| Start dev stack | `./scripts/dev.sh` |
| Stop | `./scripts/dev.sh --stop` |
| AI connection test | `uv run ovk llm test` |
| Browse free models | `uv run ovk llm free` |
| Python lint | `uv run ruff check src scripts tests` |
| Python unit tests | `uv run pytest tests/` |
| Python AI tests | `uv run pytest tests/ai/` |
| Python E2E test | `uv run --extra dev python scripts/test-e2e.py` |
| Frontend dev | `cd ovk-web && pnpm dev` |
| Frontend test | `cd ovk-web && pnpm test` |
| Frontend lint | `cd ovk-web && pnpm exec biome check src/` |

## Architecture

- **Python SSR** (`src/openvideokit/`): FastAPI serves stamped HF compositions,
  project JSON, TTS, SSE, and MP4 export. Disk-backed store with per-slide folders,
  `fcntl.flock`, and a `watchdog` file watcher.
- **Frontend** (`ovk-web/`): React 19 SPA with `<hyperframes-player>`, EditBus for
  mutations, Zustand playhead, TanStack Query + optimistic locking (content-hash rev).
- **AI** (`src/openvideokit/ai/`): a LangGraph agent that explores the project with
  read-only tools and proposes edits as `EditOp` lists over SSE. The frontend `AIDock`
  dispatches each op through the same `EditBus` a human edit uses on Accept — so
  undo/redo, lint gates, and SSE sync are preserved (AI flow == human flow). Default
  model `gpt-5.4-nano`; any OpenAI-compatible endpoint via `OPENAI_BASE_URL`
  (OpenAI / OpenRouter / Ollama / vLLM / LM Studio). See [docs/ai.md](docs/ai.md).
- **TTS**: edge-tts generates content-addressed `audio-{hash}.mp3` per slide.
  Manual Generate button (no auto-fire). Voiceover data lives in `audio.json`,
  separate from `index.json`.
- **Export**: `npx hyperframes render` subprocess on a bounded ThreadPoolExecutor
  (`OVK_MAX_CONCURRENT_RENDERS`). Voiceover audio is concatenated from per-slide
  TTS into a single track. Job metadata persists to `{project_id}/jobs.json`.
  See [docs/web/export.md](docs/web/export.md).
- **Captions**: Word-level karaoke captions baked into the composition HTML
  (`captions.py`). Both preview and render share the same GSAP timeline — no
  separate overlay system. Settings persist in `root.captions` via EditBus.

See [docs/web/](docs/web/) for detailed architecture, API reference, export
pipeline, and concurrency model, and [docs/ai.md](docs/ai.md) for the AI
implementation contract.

## Project structure

```
openvideokit/
├── src/openvideokit/       # Python SSR server
│   ├── app.py              # FastAPI + lifespan (store, executor, watcher)
│   ├── routes.py           # /api endpoints (projects, TTS, export, SSE, AI chat, chats)
│   ├── store.py            # Disk-backed store + rev + flock
│   ├── composition.py      # Self-contained GSAP composition builder
│   ├── captions.py         # Caption layer: timing + HTML + GSAP + CSS
│   ├── rendering.py        # Export pipeline: executor, jobs, voiceover concat
│   ├── voiceover.py        # edge-tts pipeline + content-addressed cache
│   ├── config.py           # Env vars + .env auto-load (python-dotenv)
│   ├── events.py           # SSE pub/sub (thread-safe)
│   ├── watcher.py          # watchdog file watcher
│   ├── stamp.py            # __OVK_*__ token stamping
│   ├── seed.py             # Fixture project
│   ├── chats.py            # JSONL chat persistence (see docs/chat.md)
│   ├── cli.py              # `ovk serve` + `ovk llm test` + `ovk llm free` (Typer)
│   └── ai/                 # LangGraph agent (see docs/ai.md)
│       ├── config.py       # OPENAI_BASE_URL / OPENAI_API_KEY / OVK_AI_MODEL
│       ├── ops.py          # EditOp mirror of ovk-web ops.ts
│       ├── graph.py        # create_agent ReAct loop
│       ├── server.py       # run_agent → SSE stream
│       ├── prompts/        # 8 modular .py prompt sections
│       └── tools/          # 4 read-only + 10 OVK EditOp-emitter tools
├── ovk-web/                # React SPA
├── tests/                  # Python unit tests (pytest)
├── scripts/                # dev.sh, test-e2e.py
├── docs/                   # ai.md + web/ + rfc/
└── legacy/                 # Frozen MVP (not imported)
```
