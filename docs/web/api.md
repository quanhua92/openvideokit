# API Reference

All endpoints are under `/api`, served by the Python FastAPI backend (`src/openvideokit/`).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OVK_HOST` | `127.0.0.1` | Bind address |
| `OVK_PORT` | `8000` | Bind port |
| `OVK_DATA_DIR` | `data` | Where project data + generated audio is written |
| `OVK_JOBS_DIR` | `{OVK_DATA_DIR}/jobs` | Where render job directories + output MP4s are written |
| `OVK_MAX_CONCURRENT_RENDERS` | `1` | Max parallel render subprocesses (ThreadPoolExecutor workers) |
| `OVK_RENDER_HF_WORKERS` | `3` | Chrome workers per render (passed to `hyperframes render --workers`) |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible endpoint (OpenRouter, Ollama, vLLM, LM Studio) |
| `OPENAI_API_KEY` | _(empty)_ | Required to use AI |
| `OVK_AI_MODEL` | `gpt-5.4-nano` | Default AI chat model id |
| `OVK_AI_TIER2_MODEL` | _= OVK_AI_MODEL_ | Reserved for `set_slide_html` coding-model routing |
| `OVK_AI_TEMPERATURE` | `0.3` | AI sampling temperature |
| `OVK_AI_MAX_STEPS` | `8` | Cap on agent tool-calling steps per turn |

All vars are auto-loaded from a root `.env` (gitignored) via `python-dotenv`; real
env vars always win. See `.env.example`. Smoke-test the AI connection with
`uv run ovk llm test`.

`dev.sh` sets `OVK_DATA_DIR=$PROJECT_DIR/data` (gitignored).

## Endpoints

### Projects

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects` | List all projects `[{id, name}]` |
| `GET` | `/api/projects/{id}` | Full bundle `{rev, root, slides, slideHtml}` |
| `PUT` | `/api/projects/{id}` | Replace bundle (requires `rev`). 200 on match, 409 on stale. **Voiceover excluded from rev** |

### Compositions

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/{id}/composition` | Self-contained root HTML (all slides inlined, caption layer, single GSAP timeline) |
| `GET` | `/api/projects/{id}/composition/compositions/{slideId}` | Single slide sub-composition (bare `<template>`) |

### Export / Render

| Method | Path | Status | Purpose |
|---|---|---|---|
| `POST` | `/api/projects/{id}/export` | 202 | Enqueue an MP4 render job |
| `GET` | `/api/projects/{id}/export/jobs` | 200 | List all jobs (memory + disk) |
| `GET` | `/api/projects/{id}/export/jobs/{jobId}` | 200 | Job status dict |
| `POST` | `/api/projects/{id}/export/jobs/{jobId}/cancel` | 200 | Cancel job (SIGTERM if running) |
| `GET` | `/api/projects/{id}/export/jobs/{jobId}/download` | 200 | Stream MP4 (only when `done`) |
| `GET` | `/api/projects/{id}/export/jobs/{jobId}/log` | 200 | Render log text (ANSI-stripped) |

See [export.md](./export.md) for the full pipeline architecture.

### Real-time

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/{id}/events` | SSE stream — pushes `{projectId, rev}` on every mutation + 15s keepalive |

### AI chat

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/projects/{id}/ai/chat` | Run one LangGraph agent turn; stream `AIStreamEvent`s as SSE |

#### POST `/api/projects/{id}/ai/chat`

Runs the agent statelessly for one turn. The agent explores the project with
read-only tools and proposes edits as `EditOp` lists — it never writes the
document. The frontend `AIDock` dispatches accepted ops through `EditBus` (AI
flow == human flow). See [../ai.md](../ai.md).

Request:
```json
{
  "messages": [{"role": "user", "content": "Change slide-0's title to be punchier"}],
  "activeSlideId": "slide-0",
  "pins": []
}
```

Response (`text/event-stream`), each `data:` line is one `AIStreamEvent`:
```
data: {"type":"open"}
data: {"type":"token","text":"Sure —"}
data: {"type":"tool_start","tool":"set_field","args":{...}}
data: {"type":"proposal","edit":{"id":"prop-...","ops":[{"kind":"setField","slideId":"slide-0","fieldId":"title","value":"..."}],"rationale":"...","slideId":"slide-0"}}
data: {"type":"done"}
```

Missing `OPENAI_API_KEY` → a graceful `error` event (no crash).

### TTS + Audio

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/projects/{id}/tts` | Generate per-slide mp3s via edge-tts + measure durations via ffprobe |
| `GET` | `/api/projects/{id}/slides/{slideId}/audio` | Stream the latest cached mp3 (reads `audio.json` pointer) |
| `GET` | `/api/projects/{id}/slides/{slideId}/audio/{hash}` | Stream a content-addressed mp3 (`audio-{hash}.mp3`) |

#### POST `/api/projects/{id}/tts`

Sends only the slides that need (re)generation. The frontend fires this
when the user clicks **Generate Audio** — no auto-fire on text edit.

Request:
```json
{
  "slides": [
    {"id": "slide-0", "text": "Meet the Eco Bottle.", "voice": "en-US-AriaNeural", "rate": "", "pitch": "", "volume": ""}
  ]
}
```

Response:
```json
{
  "timings": [
    {"slideId": "slide-0", "duration": 2.34, "audio": "/api/projects/proj-1/slides/slide-0/audio/a1b2c3d4e5f6g7h8", "audioHash": "a1b2c3d4e5f6g7h8"}
  ]
}
```

The TTS endpoint also writes the voiceover text/voice/params into
`audio.json` — this is the authoritative source for voiceover data.
`index.json` does NOT store voiceover.

## Optimistic locking

Every bundle carries a `rev` — SHA-256 hash of `{root, slides (without voiceover), slideHtml}` (first 16 hex chars). Derived on every read, never stored.

**Voiceover is excluded from the rev** — it lives in `audio.json`, managed by the TTS endpoint. This means PUT (structural edits) and TTS (voiceover) can never conflict.

- `PUT` must include the current `rev`. If the server's hash differs → 409 with the server's current bundle.
- The frontend does a 3-way merge on 409 (re-applies local edits onto the server version) and retries once. See [concurrency.md](./concurrency.md).

## Data directory layout

```
{OVK_DATA_DIR}/
├── {project_id}/
│   ├── project.json              ← root (canvas, theme, captions, slides[])
│   ├── .lock                     ← flock sidecar (cross-process write coordination)
│   ├── jobs.json                 ← export job metadata (max 50, survives restarts)
│   └── slides/
│       ├── slide-0/
│       │   ├── index.json        ← {duration, fields, assets} — NO voiceover
│       │   ├── index.html        ← bare <template> HTML
│       │   ├── audio.json        ← voiceover + audio metadata (latest pointer)
│       │   ├── audio-{hash}.mp3  ← content-addressed mp3 (one per variant)
│       │   ├── audio-{hash}.json ← companion metadata (self-contained)
│       │   └── ...               ← max 3 variants (current + 2 history)
│       └── ...
├── jobs/                         ← render job directories
│   └── {job_id}/
│       ├── index.html            ← self-contained composition + captions + audio
│       ├── voiceover.mp3         ← concatenated TTS track (if any slide has audio)
│       ├── output.mp4            ← render output (on success)
│       └── render.log            ← merged stdout+stderr from npx hyperframes render
```

### Voiceover data flow

```
User edits text → local state only (no dispatch)
User clicks Generate → dispatch(setVoiceover) + POST /tts
  → TTS writes audio-{hash}.mp3 + audio-{hash}.json + audio.json
  → audio.json = latest pointer {textHash, text, voice, duration, history}
  → Frontend stores audio URL → <audio> plays

User edits voice/params → dispatch immediately → PUT saves to audio.json
  (text/voice/params only — preserves audio metadata)
```

### Audio cache (content-addressed)

- `audio-{hash}.mp3` — one file per unique text+voice+rate+pitch+volume
- `audio-{hash}.json` — companion metadata (self-contained with the mp3)
- `audio.json` — latest pointer (copied from the companion on each generation)
- `history` array in `audio.json` — max 2 previous hashes; older variants auto-deleted
- Toggling back to a previous text → cache hit (no edge-tts), `audio.json` pointer updated

## Disk-backed store

- **Startup**: `init_store()` scans `OVK_DATA_DIR` for `*/project.json`. If empty, seeds the fixture.
- **Write (PUT)**: `update_project()` acquires `fcntl.flock`, re-reads from disk for rev check, writes atomically (temp + rename).
- **Voiceover load**: `_load_from_disk` merges voiceover from `audio.json` into slides (if it exists).
- **File watcher**: monitors `project.json`, `index.json`, `index.html` only (NOT audio files — they'd cause stale reloads). On change → `reload_from_disk()` → SSE push.
