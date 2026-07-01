# API Reference

All endpoints are under `/api`, served by the Python FastAPI backend (`src/openvideokit/`).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OVK_HOST` | `127.0.0.1` | Bind address |
| `OVK_PORT` | `8000` | Bind port |
| `OVK_DATA_DIR` | `data` | Where generated audio + assets are written |

`dev.sh` sets `OVK_DATA_DIR=$PROJECT_DIR/data` (gitignored).

## Endpoints

### Projects

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects` | List all projects `[{id, name}]` |
| `GET` | `/api/projects/{id}` | Full bundle `{rev, root, slides, slideHtml}` |
| `PUT` | `/api/projects/{id}` | Replace bundle (requires `rev` in body). 200 on match, 409 on stale |

### Compositions

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/{id}/composition` | Self-contained root HTML (all slides inlined, single GSAP timeline) |
| `GET` | `/api/projects/{id}/composition/compositions/{slideId}` | Single slide sub-composition (bare `<template>`) |

### Real-time

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/{id}/events` | SSE stream — pushes `{projectId, rev}` on every mutation + 15s keepalive |

### TTS + Audio

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/projects/{id}/tts` | Generate per-slide mp3s via edge-tts + measure durations via ffprobe |
| `GET` | `/api/projects/{id}/audio/{slideId}` | Stream a slide's generated mp3 |

#### POST `/api/projects/{id}/tts`

Request:
```json
{
  "slides": [
    {"id": "slide-0", "text": "Meet the Eco Bottle.", "voice": "en-US-AriaNeural"}
  ]
}
```

Response:
```json
{
  "timings": [
    {"slideId": "slide-0", "duration": 2.34, "audio": "/api/projects/proj-1/audio/slide-0"}
  ]
}
```

Audio files are saved to `{OVK_DATA_DIR}/{project_id}/audio/{slide_id}.mp3`.

## Optimistic locking

Every bundle carries a `rev` — SHA-256 hash of `{root, slides, slideHtml}` (first 16 hex chars). Derived on every read, never stored.

- `PUT` must include the current `rev`. If the server's hash differs → 409 with the server's current bundle.
- The frontend does a 3-way merge on 409 (re-applies local edits onto the server version) and retries once. See [concurrency.md](./concurrency.md).

## Data directory layout

```
{OVK_DATA_DIR}/
└── {project_id}/
    └── audio/
        ├── slide-0.mp3    ← edge-tts output
        ├── slide-1.mp3
        └── slide-2.mp3
```
