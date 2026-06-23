# Deployment

OpenVideoKit runs as a single FastAPI process. For production you'll want to think about process management, persistence, auth, and where Chrome lives.

## Environment variables

All configurable via env vars, all optional (defaults shown):

```bash
OVK_BASE_DIR=.                         # project root (used as fallback for paths below)
OVK_TEMPLATES_DIR=$OVK_BASE_DIR/templates
OVK_SESSIONS_DIR=$OVK_BASE_DIR/sessions
OVK_JOBS_DIR=$OVK_BASE_DIR/jobs
OVK_PORT=8765                          # HTTP listen port
OVK_RENDER_WORKERS=3                   # parallel Chrome processes per render
```

For containerized deploys, point the data dirs at mounted volumes:

```bash
OVK_TEMPLATES_DIR=/data/templates
OVK_SESSIONS_DIR=/data/sessions    # ephemeral, can be tmpfs
OVK_JOBS_DIR=/data/jobs            # persistent, must survive restarts
```

## Prerequisites on the host

OpenVideoKit shells out to `npx hyperframes render`, which needs:

- **Node.js** ≥ 18 (`npx` ships with it)
- **Chromium / Chrome** — installed automatically by `hyperframes` on first render
- **FFmpeg + FFprobe** — system install:
  ```bash
  # Debian/Ubuntu
  apt-get install -y ffmpeg
  # Alpine
  apk add --no-cache ffmpeg
  # macOS
  brew install ffmpeg
  ```

Verify with `hyperframes doctor` once installed.

## Running with uv

```bash
uv sync --extra dev
uv run openvideokit
# → Uvicorn running on http://0.0.0.0:8765
```

For production, drop `--reload` (already off by default) and consider `--workers` carefully — see [Concurrency](#concurrency--scaling) below.

## Running with uvicorn directly

Once the package is installed (`uv sync` or `pip install .`):

```bash
uvicorn openvideokit.app:app --host 0.0.0.0 --port 8765
```

## Docker

```dockerfile
FROM node:22-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv && uv sync --no-dev --frozen

COPY src/ src/
COPY templates/ templates/

ENV OVK_BASE_DIR=/app \
    OVK_SESSIONS_DIR=/data/sessions \
    OVK_JOBS_DIR=/data/jobs

# Warm the hyperframes cache (downloads Chrome on first run)
RUN npx --yes hyperframes doctor || true

VOLUME ["/data/sessions", "/data/jobs"]
EXPOSE 8765

CMD ["uv", "run", "uvicorn", "openvideokit.app:app", "--host", "0.0.0.0", "--port", "8765"]
```

Build & run:

```bash
docker build -t openvideokit .
docker run -p 8765:8765 \
  -v $(pwd)/templates:/app/templates:ro \
  -v ovk-sessions:/data/sessions \
  -v ovk-jobs:/data/jobs \
  openvideokit
```

## Reverse proxy (Caddy / nginx)

You'll want a reverse proxy for TLS termination and auth. Caddy is the simplest:

```caddyfile
video.example.com {
    reverse_proxy localhost:8765

    # Optional: HTTP basic auth
    basicauth /* {
        {env.OPENVIDEOKIT_AUTH_HASH}
    }
}
```

For cookie-based auth (so the `<hyperframes-player>` iframe sends credentials automatically), put auth on the proxy and let session cookies flow through.

**Important**: protect `/session/*` and `/preview/*` with the same auth as `/editor/*`. The player iframe fetches composition files from there — if those routes are unauthenticated, the auth on `/editor` is meaningless.

## Concurrency & scaling

Each render spawns N Chrome workers (`OVK_RENDER_WORKERS`), each using ~256 MB RAM. So:

| Concurrent renders | Chrome procs | Peak RAM |
|---|---|---|
| 1 | 3 | ~0.8 GB |
| 3 | 9 | ~2.3 GB |
| 5 | 15 | ~3.8 GB |

For more than ~3 concurrent renders, add a queue:

1. FastAPI receives the form, writes the session to disk, enqueues `{session_id}` to Redis.
2. A separate worker process (Celery / RQ / dramatiq) consumes the queue, runs `hyperframes render`, writes the MP4.
3. The FastAPI `/job/{job_id}` endpoint reads status from Redis instead of the in-memory `JOBS` dict.

Swap `rendering.py:start_render()` and `rendering.py:get_job()` — the rest of the app stays the same.

## Persistence

The in-memory `JOBS` dict in `config.py` is **lost on restart**. If a render is in progress when the FastAPI process dies, the orphaned `npx hyperframes render` subprocess keeps running but its result is unreachable.

For production, persist job state to Redis or a DB table:

```python
# rendering.py — sketch
def start_render(session_id: str) -> str:
    job_id = uuid.uuid4().hex[:12]
    redis.hset(f"ovk:job:{job_id}", mapping={
        "session_id": session_id, "status": "running",
        "started_at": time.time(),
    })
    # ... enqueue to Celery / RQ
    return job_id

def get_job(job_id: str) -> dict | None:
    raw = redis.hgetall(f"ovk:job:{job_id}")
    return raw or None
```

## Session janitor

Sessions accumulate on disk. Add a janitor that runs on a timer:

```python
# sketch: delete session dirs older than 24h
import shutil, time
from pathlib import Path
from .config import SESSIONS_DIR

def reap_old_sessions(ttl_seconds: int = 86400) -> int:
    cutoff = time.time() - ttl_seconds
    n = 0
    for d in SESSIONS_DIR.iterdir():
        if d.is_dir() and d.stat().st_mtime < cutoff:
            shutil.rmtree(d)
            n += 1
    return n
```

Trigger via an APScheduler background task or a cron'd admin endpoint.

## Auth

The PoC has **no authentication**. Anyone reaching `/editor/{id}` can submit forms and trigger renders (which cost CPU + RAM).

Minimum viable auth: HTTP basic auth at the reverse proxy (see Caddy config above). For real multi-tenant:

- Wrap every route handler with a `Depends(get_current_user)` that reads a session cookie
- Add `/login` and `/logout` endpoints (or delegate to an OAuth provider)
- The `<hyperframes-player>` iframe sends cookies same-origin, so no extra wiring needed — just make sure `/session/*` is cookie-authed too

## Cloud-native alternatives

If running your own Chrome farm sounds painful, HeyGen ships official templates for hosted render:

- [Vercel template](https://github.com/heygen-com/hyperframes-vercel-template) — Next.js + Vercel Sandbox + Blob storage
- [Cloudflare template](https://github.com/heygen-com/hyperframes-cloudflare-template) — Workers + Containers + R2

You can run OpenVideoKit as the editor + preview layer and forward `/render/{session_id}` to one of these backends instead of the local `npx hyperframes render` subprocess.
