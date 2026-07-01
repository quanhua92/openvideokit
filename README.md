# OpenVideoKit

> Scene-based video editor — Python SSR + `<hyperframes-player>` + edge-tts.

OpenVideoKit is a video templating pipeline: edit slides in a web UI → Python SSR
stamps values into self-contained GSAP compositions → `<hyperframes-player>` renders
them live → edge-tts generates voiceover audio.

```
 ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
 │  ovk-web     │    │  Python API  │    │  Disk        │
 │  (React SPA) │    │  (FastAPI)   │    │  (per-slide) │
 │  :3000       │←──→│  :8000       │←──→│  data/       │
 │              │    │              │    │              │
 │ <hf-player>  │    │ Stamp HTML   │    │ project.json │
 │ EditBus      │    │ PUT/SSE/rev  │    │ index.json   │
 │ Playhead     │    │ edge-tts     │    │ audio-{hash} │
 └──────────────┘    └──────────────┘    └──────────────┘
```

## Quickstart

```bash
git clone <this-repo>
cd openvideokit
uv sync --extra dev              # install Python deps
cd ovk-web && pnpm install && cd ..  # install frontend deps
./scripts/dev.sh                 # start both servers (background)
```

Open `http://localhost:3000` in a browser.

- **Python API** → `http://localhost:8000`
- **Vite dev** → `http://localhost:3000` (proxies `/api` → `:8000`)
- **Logs** → `tail -f /tmp/ovk-server.log | tail -f /tmp/ovk-vite.log`
- **Stop** → `./scripts/dev.sh --stop`

## Commands

| Task | Command |
|---|---|
| Start dev stack | `./scripts/dev.sh` |
| Stop | `./scripts/dev.sh --stop` |
| Python lint | `uv run ruff check src scripts tests` |
| Python unit tests | `uv run pytest tests/` |
| Python E2E test | `uv run --extra dev python scripts/test-e2e.py` |
| Frontend dev | `cd ovk-web && pnpm dev` |
| Frontend test | `cd ovk-web && pnpm test` |
| Frontend lint | `cd ovk-web && pnpm exec biome check src/` |

## Architecture

- **Python SSR** (`src/openvideokit/`): FastAPI serves stamped HF compositions,
  project JSON, TTS, and SSE. Disk-backed store with per-slide folders, `fcntl.flock`,
  and a `watchdog` file watcher.
- **Frontend** (`ovk-web/`): React 19 SPA with `<hyperframes-player>`, EditBus for
  mutations, Zustand playhead, TanStack Query + optimistic locking (content-hash rev).
- **TTS**: edge-tts generates content-addressed `audio-{hash}.mp3` per slide.
  Manual Generate button (no auto-fire). Voiceover data lives in `audio.json`,
  separate from `index.json`.

See [docs/web/](docs/web/) for detailed architecture, API reference, and
concurrency model.

## Project structure

```
openvideokit/
├── src/openvideokit/       # Python SSR server
│   ├── app.py              # FastAPI + lifespan (store init, watcher)
│   ├── routes.py           # /api endpoints
│   ├── store.py            # Disk-backed store + rev + flock
│   ├── composition.py      # Self-contained GSAP composition builder
│   ├── voiceover.py        # edge-tts pipeline + content-addressed cache
│   ├── events.py           # SSE pub/sub (thread-safe)
│   ├── watcher.py          # watchdog file watcher
│   ├── stamp.py            # __OVK_*__ token stamping
│   ├── seed.py             # Fixture project
│   └── cli.py              # `ovk serve` (Typer)
├── ovk-web/                # React SPA
├── tests/                  # Python unit tests (pytest)
├── scripts/                # dev.sh, test-e2e.py
├── docs/web/               # Architecture docs
└── legacy/                 # Frozen MVP (not imported)
```
