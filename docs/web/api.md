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
├── {project_id}/
│   ├── project.json       ← bundle {root, slides, slideHtml} (no rev — derived)
│   ├── project.lock       ← flock sidecar (cross-process write coordination)
│   └── audio/
│       ├── slide-0.mp3    ← edge-tts output
│       ├── slide-0.json   ← TTS metadata {textHash, duration, voice, rate, ...}
│       └── ...
```

## Disk-backed store

Project bundles are persisted to `project.json` on disk with a write-through
in-memory cache:

- **Startup**: `init_store()` scans `OVK_DATA_DIR` for `*/project.json` and
  loads them. If empty, seeds the fixture project to disk.
- **Write**: `update_project()` acquires an exclusive `fcntl.flock` on
  `project.lock`, re-reads from **disk** (not cache) for the rev check, writes
  atomically (temp file + rename), then releases the lock.
- **External edit**: a `watchdog` file watcher monitors `OVK_DATA_DIR`. When
  an external process (AI agent, manual edit) modifies `project.json`, the
  watcher calls `reload_from_disk()` → updates cache → broadcasts SSE →
  connected clients refetch and the HF player reloads.

### Cross-process safety

| Scenario | Mechanism |
|---|---|
| Two HTTP PUTs from different clients | rev check (409) + flock |
| HTTP PUT vs external file edit | flock coordinates read-check-write; watcher reloads on external change |
| Server restart | loads from disk — no data loss |

`fcntl.flock` is advisory on POSIX — both the server and any external writer
must use it for full safety. The atomic temp-file + rename ensures no
corruption even if one side ignores the lock.
