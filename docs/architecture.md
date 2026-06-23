# Architecture

How OpenVideoKit fits together at the module and request level.

## Request lifecycle

```
Browser                            FastAPI                  HyperFrames CLI
───────                            ───────                  ──────────────
GET /editor/cloud-render      →    templating.render_editor_page()
                                  (reads templates/cloud-render/template.json)
                                 ↓
                                  returns auto-generated HTML form

POST /preview/cloud-render    →    shutil.copytree(template, sessions/<uuid>)
  multipart: text + image          templating.stamp_session():
                                      • Jinja2 fills {{ slot_id }} markers
                                      • image bytes written to slot path
                                 ↓
                                  303 → /preview/<uuid>

GET /preview/<uuid>           →    returns <hyperframes-player> wrapper
                                 ↓
                                  player iframe loads /session/<uuid>/index.html
                                  runtime fetches compositions/, assets/...

POST /render/<uuid>           →    rendering.start_render():
                                      subprocess.Popen([
                                        npx hyperframes render
                                        sessions/<uuid>
                                        --workers 3
                                        --output jobs/<job_id>.mp4
                                      ])
                                      background thread polls proc.wait()
                                 ↓
                                  303 → /job/<job_id>

GET /job/<job_id>             →    rendering.get_job()
                                  (auto-refreshes every 3s via <meta>)

GET /download/<job_id>        →    FileResponse(jobs/<job_id>.mp4)
```

## Module responsibilities

| Module | Owns | Doesn't do |
|---|---|---|
| `config.py` | paths, env vars, `JOBS` registry, `ensure_data_dirs()` | HTTP, business logic |
| `templating.py` | schema I/O, Jinja2 stamping, HTML page generators | subprocess, persistence |
| `rendering.py` | `hf render` subprocess + thread-based job tracking | HTTP routes, HTML |
| `app.py` | FastAPI instance + all `@app.{get,post}` handlers | template logic (delegates to `templating`) |
| `__main__.py` | `uvicorn.run(...)` entry point | — |

The split keeps `templating` and `rendering` independently testable — you can call `stamp_session()` or `start_render()` from a script without spinning up FastAPI.

## Data flow

```
                         read-only                per-edit copy         per-render output
                         ─────────                ─────────────         ───────────────
templates/<id>/        →  sessions/<uuid>/      →   jobs/<job_id>.mp4
  index.html                index.html (stamped)     jobs/<job_id>.log
  compositions/             compositions/ (stamped)
  assets/                   assets/ (some replaced)
  template.json             template.json (copied)
```

- **`templates/`** is the source of truth. Treat it as code: lint it, review it, version it.
- **`sessions/<uuid>/`** is a one-shot copy created per form submission. Mutated by Jinja2 + image writes. Safe to delete on a TTL.
- **`jobs/<job_id>.{mp4,log}`** is the render output. Streamed back via `/download/<job_id>`. Persist as long as users may redownload; backfill to S3/Blob for production.

## Why the `<hyperframes-player>` instead of a custom runtime?

We tried writing a custom composition loader + master clock. It worked but reimplemented a wheel HeyGen already ships. The official web component is:

- 3 KB gzipped, zero deps, CDN-loaded
- Mirrors the `<video>` element API (`play()`, `pause()`, `seek()`, `currentTime`)
- Handles composition fetching, GSAP timeline driving, audio sync, scaling
- Maintained by upstream — you get engine fixes for free

Tradeoff: it's **real HTML playback**, not a pre-rendered video. Paint-heavy compositions can stutter on weak hardware. For buttery-smooth playback you still want the render-to-MP4 path. See the [preview vs render discussion in the HyperFrames docs](https://hyperframes.heygen.com/packages/cli).

## Concurrency & state

- The `JOBS` dict is in-memory (module-level in `config.py`). Each render spawns its own Chrome subprocess, so the FastAPI process itself stays light.
- For multi-process deployments (multiple uvicorn workers, Gunicorn + Uvicorn workers), `JOBS` won't be shared. Swap for Redis or a DB row per job — see [deployment.md](deployment.md).
- `start_render()` writes the subprocess output directly to `jobs/<job_id>.mp4` so the FastAPI process never holds the MP4 bytes in memory.
- `download()` streams via `FileResponse`, so even a 100 MB MP4 doesn't blow memory.

## Limits to be aware of

- **Render latency**: ~45s for a 40s 1080p30 video with 3 workers. Inherent to browser frame-capture; can't be sped up below real-time.
- **Concurrent renders**: each render spawns 3 Chrome workers (~256 MB each). 4 concurrent users × 3 workers = 12 Chrome processes. Cap via an outer queue (Celery/RQ) before you OOM.
- **Session disk usage**: each `shutil.copytree` duplicates the template. A 20 MB template × 1000 sessions = 20 GB. Add a janitor that cleans `sessions/` on a TTL.
- **`hf` cold start**: first render after install downloads Chrome + FFmpeg (~300 MB). Subsequent renders are fast.
