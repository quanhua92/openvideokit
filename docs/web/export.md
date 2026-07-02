# Export / Render Pipeline

How OpenVideoKit turns a project bundle into an MP4 file via `npx hyperframes render`.

## Overview

The export pipeline materialises a self-contained render directory (composition HTML + concatenated voiceover audio), then spawns `npx hyperframes render` as a subprocess on a **dedicated worker thread**. The FastAPI event loop is never blocked — other users' requests flow normally while renders run.

```
User clicks "Export as MP4"
  │
  ▼
POST /api/projects/{id}/export
  │
  ├─ build_root_composition(project)        ← self-contained HTML (slides inlined
  │                                            + caption layer + caption GSAP timeline)
  ├─ _build_voiceover_track(project)        ← ffmpeg concat per-slide audio + silence
  ├─ _inject_voiceover_audio(html, total)   ← <audio id="voiceover" data-start data-duration>
  ├─ write index.html + voiceover.mp3 → {JOBS_DIR}/{job_id}/
  ├─ create JOBS[job_id] = { status: "queued", ... }
  ├─ _persist_job(job)                      ← atomic write to {project_id}/jobs.json
  └─ executor.submit(_run_render_job, job_id)  ← non-blocking
  │
  ▼
returns 202 { job_id, status: "queued" }
```

The frontend Exports page polls `GET /api/projects/{id}/export/jobs` every 2s while any job is active, stopping once all reach a terminal state.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OVK_MAX_CONCURRENT_RENDERS` | `1` | Max parallel render subprocesses (ThreadPoolExecutor workers). Set to `2` for a beefier machine. |
| `OVK_RENDER_HF_WORKERS` | `3` | Chrome workers **per render** (passed to `hyperframes render --workers`). This is HF's internal parallelism, NOT outer-level concurrency. |
| `OVK_JOBS_DIR` | `{OVK_DATA_DIR}/jobs` | Where render job directories + output MP4s are written. |

All are defined in `src/openvideokit/config.py`.

### Resource budget

Each `hyperframes render` subprocess spawns `OVK_RENDER_HF_WORKERS` Chrome processes (~256 MB each). With defaults:

| Setting | Chrome procs | Peak RAM |
|---|---|---|
| `MAX_CONCURRENT_RENDERS=1`, `HF_WORKERS=3` | 3 | ~768 MB |
| `MAX_CONCURRENT_RENDERS=2`, `HF_WORKERS=3` | 6 | ~1.5 GB |

Tune both env vars to stay within your machine's RAM.

## API endpoints

All under `/api`, same prefix as the rest of the backend.

| Method | Path | Status | Purpose |
|---|---|---|---|
| `POST` | `/projects/{id}/export` | 202 | Enqueue a render job. Returns `{job_id, status}` immediately. |
| `GET` | `/projects/{id}/export/jobs` | 200 | List all jobs for this project (memory + disk, most recent first). |
| `GET` | `/projects/{id}/export/jobs/{jobId}` | 200 | JSON job dict. 404 if not found or not owned by this project. |
| `POST` | `/projects/{id}/export/jobs/{jobId}/cancel` | 200 | Request cancellation. SIGTERMs the subprocess if running; marks `cancelled`. |
| `GET` | `/projects/{id}/export/jobs/{jobId}/download` | 200 | `FileResponse` video/mp4. 404 if not `done`. |
| `GET` | `/projects/{id}/export/jobs/{jobId}/log` | 200 | Render log text (ANSI-stripped tail). |

### Job dict shape

```json
{
  "id": "a1b2c3d4e5f6",
  "project_id": "proj-1",
  "status": "running",
  "output": "data/jobs/a1b2c3d4e5f6/output.mp4",
  "log": "data/jobs/a1b2c3d4e5f6/render.log",
  "started_at": 1719900000.0,
  "ended_at": null,
  "exit_code": null,
  "error": null
}
```

Statuses: `queued` → `running` → `done` | `failed` | `cancelled`.

The `reconstructed: true` field appears on jobs looked up via the filesystem fallback (after a server restart — the in-memory `JOBS` dict is lost but the MP4/log files survive on disk).

### POST `/projects/{id}/export`

No request body needed — the server reads the current project bundle from the store.

**Important:** the render captures a **snapshot** of the project at enqueue time. Subsequent edits do not affect an in-flight render. This is intentional — the output is deterministic and reproducible.

Response (202):
```json
{ "job_id": "a1b2c3d4e5f6", "status": "queued" }
```

### POST `/projects/{id}/export/jobs/{jobId}/cancel`

If the job is `running`: sends SIGTERM to the `npx hyperframes render` subprocess. The worker thread detects the termination, checks `_cancel_requested`, and marks the job `cancelled`.

If the job is `queued` (waiting in the executor's internal queue): sets `_cancel_requested = true`. The worker checks this flag before starting and marks the job `cancelled` without launching the subprocess.

If the job is already terminal (`done` / `failed` / `cancelled`): no-op, returns current state.

## Concurrency model

```
                    ThreadPoolExecutor
                    (max_workers = OVK_MAX_CONCURRENT_RENDERS)
                    ┌─────────────────────────────────┐
                    │                                 │
POST /export ──────>│  Queue: [job_A] [job_B] [job_C] │
                    │                                 │
                    │  Worker 1: _run_render_job(A)   │──> npx hyperframes render (subprocess)
                    │  Worker 2: _run_render_job(B)   │──> npx hyperframes render (subprocess)
                    │  (job_C waits in queue)         │
                    └─────────────────────────────────┘
```

- **`ThreadPoolExecutor`** created in `app.py` lifespan via `init_executor(MAX_CONCURRENT_RENDERS)`. Shutdown on app exit via `shutdown_executor()`.
- Each worker runs `_run_render_job(job_id)` which does blocking `subprocess.Popen(...).wait()` **on the worker thread** — the asyncio event loop is completely unaffected.
- Extra enqueues (beyond `max_workers`) sit in the executor's internal unbounded queue with status `queued`.
- The `_JOBS` dict is guarded by a `threading.Lock` — both the FastAPI request handlers and the worker threads mutate it safely.

### Why not asyncio subprocess?

FastAPI runs on asyncio, but `npx hyperframes render` is a long-running blocking subprocess (30s–5min). Using `asyncio.create_subprocess_exec` would work, but:
- It ties up the event loop's thread pool slots.
- SIGTERM-based cancellation is simpler with a raw `subprocess.Popen` handle.
- A dedicated `ThreadPoolExecutor` physically isolates render work from all other I/O.

The ThreadPoolExecutor pattern keeps renders off the event loop entirely — other users' GET/PUT/SSE requests see zero impact.

## Voiceover audio pipeline

The render is **not** silent. Per-slide TTS audio (generated by `POST /api/projects/{id}/tts` during editing) is concatenated into a single voiceover track aligned to slide start times.

```
Slide 0 (5.0s, has audio)     Slide 1 (5.0s, no audio)    Slide 2 (5.0s, has audio)
     │                              │                              │
     ▼                              ▼                              ▼
 ┌─────────┐                  ┌─────────┐                  ┌─────────┐
 │ audio   │                  │ silence │                  │ audio   │
 │ (3.2s)  │                  │ (5.0s)  │                  │ (4.1s)  │
 │ + pad   │                  │         │                  │ + pad   │
 │ (1.8s)  │                  │         │                  │ (0.9s)  │
 └─────────┘                  └─────────┘                  └─────────┘
     │                              │                              │
     └────────── ffmpeg concat ─────┴──────────────────────────────┘
                         │
                         ▼
                   voiceover.mp3 (15.0s)
```

`_build_voiceover_track()` in `rendering.py`:
1. For each slide (in order): reads `slides/{slide_id}/audio.json` to find the current `audio-{hash}.mp3`.
2. If audio exists: ffmpeg `apad` + `atrim` to pad/trim to the slide's `duration`.
3. If no audio: ffmpeg `anullsrc` to generate silence of `slide.duration` length.
4. ffmpeg `concat` demuxer joins all segments → `voiceover.mp3`.

If **no slide has audio** at all, the voiceover step is skipped and the render is video-only.

### Audio injection into composition

`_inject_voiceover_audio()` inserts an `<audio>` element + GSAP sync script into the composition HTML:

```html
<audio id="ovk-voiceover" src="voiceover.mp3" preload="auto" hidden></audio>
<script>
  (function () {
    var vo = document.getElementById('ovk-voiceover');
    if (!vo) return;
    function setup() {
      var tl = window.__timelines && window.__timelines['root'];
      if (!tl) { setTimeout(setup, 50); return; }
      tl.eventCallback('onStart', function () { vo.play().catch(function () {}); });
      tl.eventCallback('onUpdate', function () {
        var t = tl.time();
        if (Math.abs(vo.currentTime - t) > 0.3) vo.currentTime = t;
      });
      tl.eventCallback('onComplete', function () { vo.pause(); });
    }
    setup();
  })();
</script>
```

The voiceover plays when the GSAP root timeline starts (triggered by `hyperframes render`'s internal playback). The `onUpdate` callback re-seeks the audio if drift exceeds 0.3s — this handles timeline scrubbing and render-frame stepping.

## Render job directory layout

```
{OVK_JOBS_DIR}/
└── {job_id}/                    ← 12-char hex UUID
    ├── index.html               ← self-contained composition (slides inlined + audio)
    ├── voiceover.mp3            ← concatenated voiceover track (if any slide has audio)
    ├── output.mp4               ← render output (appears on success)
    └── render.log               ← merged stdout+stderr from npx hyperframes render
```

The log file captures HF's progress output (ANSI-stripped on read via `read_job_log()`). Useful for debugging failed renders.

## Job lifecycle

```
          ┌─────────┐
          │ queued  │  ← submitted to executor, waiting for a worker
          └────┬────┘
               │ worker picks it up
               ▼
          ┌─────────┐
          │ running │  ← subprocess.Popen spawned, .wait() blocking on worker thread
          └────┬────┘
               │
     ┌─────────┼──────────┐
     │         │          │
     ▼         ▼          ▼
┌──────┐ ┌──────┐  ┌──────────┐
│ done │ │failed│  │cancelled │
└──────┘ └──────┘  └──────────┘
rc==0 &&    rc!=0    SIGTERM by
mp4 exists  or no    cancel_job()
            mp4
```

### Success condition (dual-check)

A job is `done` only if **both**:
1. `proc.wait()` returns exit code 0
2. `output.mp4` exists on disk

This catches the case where `npx hyperframes render` exits cleanly but produces no MP4 (rare HF bug).

### Filesystem fallback (post-restart)

The `JOBS` dict is in-memory and lost on server restart. But `output.mp4` and `render.log` survive on disk. `get_job()` reconstructs a job's status from the filesystem:

- `output.mp4` exists → `status: "done"`
- only `render.log` exists → `status: "failed"`
- neither → 404

Reconstructed jobs carry `"reconstructed": true` and `"project_id": "(unknown — pre-restart)"`.

## Job persistence (`jobs.json`)

Every job is persisted to `{OVK_DATA_DIR}/{project_id}/jobs.json` (atomic write) on enqueue and on finish. This survives server restarts — the Exports page shows historical exports even after a crash.

**Stale state reconciliation**: if the server crashes mid-render, the job is stuck at `queued` or `running` in `jobs.json` forever. `_load_disk_jobs()` fixes this on every `list_jobs` call: if a disk job has an active status but isn't in memory (server restarted), it checks the filesystem — `output.mp4` exists → `done`, otherwise → `failed`. The reconciled status is written back to disk immediately.

```
{OVK_DATA_DIR}/
├── {project_id}/
│   ├── project.json
│   ├── jobs.json              ← [{id, status, output, started_at, ...}, ...]  (max 50)
│   └── slides/
└── jobs/
    └── {job_id}/
        ├── index.html          ← composition + captions + audio
        ├── voiceover.mp3       ← concatenated TTS track (if any slide has audio)
        ├── output.mp4          ← render output (on success)
        └── render.log          ← merged stdout+stderr from npx hyperframes render
```

## Frontend wiring

| File | Role |
|---|---|
| `app/layout/AppShell.tsx` | Overflow menu: "Export as MP4" (dialog) + "View Exports" (page link) |
| `features/export/components/ExportDialog.tsx` | Start button → POST /export → auto-navigate to Exports page |
| `features/export/pages/ExportsPage.tsx` | Full page: TanStack Query polling (2s), status badges, elapsed time, file size, log viewer, download, cancel |
| `routes/projects.$projectId.exports.tsx` | Route: `/projects/:id/exports` |
| `shared/api/schemas/renderJob.ts` | zod `RenderJobSchema` + `RenderStatus` union |
| `shared/api/client.ts` | `startExport`, `listExportJobs`, `getExportJob`, `cancelExport`, `getExportLog`, `exportDownloadUrl` |

### Exports page polling

```
ExportsPage mounts
  │
  ├─ useQuery(["exportJobs", projectId], client.listExportJobs)
  │   refetchInterval = 2000ms while any job is queued/running, else false
  │
  ├─ "New Export" button → client.startExport() → invalidate query
  ├─ Cancel button → client.cancelExport(jobId) → invalidate query
  └─ Log toggle → useQuery(["exportLog", jobId], client.getExportLog, refetchInterval=3000)
```

## Caption layer

Captions are baked into the composition HTML by `captions.py` — both the preview (HF player) and the render (`npx hyperframes render`) share the same composition, so captions match exactly. Caption settings persist in `root.captions` in the project bundle (dispatched via `setCaptionSettings` EditBus op).

See [architecture.md](./architecture.md) § Caption system for details.

## Limitations (v1)

1. **No background music** — only voiceover audio is embedded. Background music bed (`root.audio.music`) is not yet mixed into the render. Future: ffmpeg `amix` to blend voiceover + music.

2. **No progress percentage** — `npx hyperframes render` doesn't emit structured progress. The UI shows elapsed time but no %. Future: parse HF's log output for frame counts.

3. **Single-process only** — the ThreadPoolExecutor + `JOBS` dict live in one process. Multiple uvicorn workers each have their own executor and registry. Use a single worker (`--workers 1`) or swap for Celery/RQ. (Disk-persisted `jobs.json` means historical jobs are still visible across workers, but active job state is not shared.)

## Module reference

| Module | Owns | Key functions |
|---|---|---|
| `src/openvideokit/rendering.py` | Job lifecycle, executor, voiceover concat, audio injection | `enqueue_render()`, `_run_render_job()`, `get_job()`, `cancel_job()`, `_build_voiceover_track()` |
| `src/openvideokit/config.py` | Env vars | `MAX_CONCURRENT_RENDERS`, `RENDER_HF_WORKERS`, `JOBS_DIR` |
| `src/openvideokit/routes.py` | Export routes | `start_export()`, `get_export_job()`, `cancel_export()`, `download_export()` |
| `src/openvideokit/app.py` | Executor lifecycle | `init_executor()` / `shutdown_executor()` in lifespan |
