# HTTP API reference

All routes are mounted at the server root. Default port is `8765` (override via `OVK_PORT`).

## `GET /`

Landing page. Renders a human-friendly HTML home page listing all templates as clickable cards.

**Response** — `200 text/html`

Each card links to `/editor/{template_id}`.

---

## `GET /api`

Server info + list of registered templates (JSON).

**Response** — `200 application/json`

```json
{
  "name": "OpenVideoKit",
  "templates": ["cloud-render"],
  "endpoints": {
    "editor":   "/editor/{template_id}",
    "preview":  "POST /preview/{template_id}",
    "render":   "POST /render/{session_id}",
    "job":      "/job/{job_id}",
    "download": "/download/{job_id}"
  }
}
```

---

## `GET /editor/{template_id}`

Returns an HTML form auto-generated from the template's `template.json` schema.

**Path params**
- `template_id` — template directory name under `templates/`

**Response** — `200 text/html` (the form page)

**Errors**
- `404` — template not found

The form's `action` is `POST /preview/{template_id}` with `enctype="multipart/form-data"`. Submitting it creates a session and 303-redirects to `/preview/{session_id}`.

---

## `POST /preview/{template_id}`

Accepts the editor form, stamps the user values into a fresh session copy of the template, and redirects to the preview page.

**Path params**
- `template_id` — template to clone

**Body** — `multipart/form-data`
- One field per slot in the schema:
  - `text` slots: string value
  - `image` slots: file upload (any MIME type the template accepts)

**Response** — `303 See Other`
- `Location: /preview/{session_id}`

**Errors**
- `404` — template or template dir missing

---

## `GET /preview/{session_id}`

Returns the preview wrapper HTML containing a `<hyperframes-player>` web component pointed at the session's `index.html`.

**Path params**
- `session_id` — 12-char hex session id from the `POST /preview` redirect

**Response** — `200 text/html`

**Errors**
- `404` — session expired or not found

---

## `GET /session/{session_id}/{path}`

Serves any file from a session directory. Used by the `<hyperframes-player>` iframe to fetch the stamped composition HTML, sub-compositions, and assets.

**Path params**
- `session_id` — session to read from
- `path` — relative path inside the session dir (e.g. `index.html`, `compositions/hero.html`, `assets/logo.svg`)

**Response** — `200` with the file and a guessed `Content-Type` (range-request-capable for media files)

**Errors**
- `404` — file missing or path traversal attempt detected

Path traversal is blocked: the resolved path must stay under the session directory.

---

## `POST /render/{session_id}`

Spawns `npx hyperframes render` on the session directory in the background. Returns immediately with a redirect to the job status page.

**Path params**
- `session_id` — session to render

**Response** — `303 See Other`
- `Location: /job/{job_id}`

**Errors**
- `404` — session not found

**Cost**: roughly real-time (40s video ≈ 45s render with 3 workers). Tune via `OVK_RENDER_WORKERS`.

---

## `GET /job/{job_id}`

Auto-refreshing HTML status page for a render job.

**Path params**
- `job_id` — 12-char hex job id from the `POST /render` redirect

**Response** — `200 text/html`
- Refreshes every 3 seconds while `status == "running"` (via `<meta http-equiv="refresh">`)
- Shows a **Download MP4** button once `status == "done"`

The page parses status from a `Status:</b> {status}` string in the body. If you're scripting against this endpoint from a non-browser client, prefer the JSON-shaped details in `GET /job/{job_id}/log` or wrap `rendering.get_job()` directly.

**Errors**
- `404` — unknown job id

---

## `GET /job/{job_id}/log`

Raw render log (stdout + stderr from the `hyperframes render` subprocess).

**Path params**
- `job_id`

**Response** — `200 text/html` (`<pre>` wrapped)

**Errors**
- `404` — unknown job id

---

## `GET /download/{job_id}`

Streams the finished MP4.

**Path params**
- `job_id`

**Response** — `200 video/mp4` with `Content-Disposition: attachment; filename="{session_id}.mp4"`

**Errors**
- `404` — job not found, or status != `"done"`

Streaming is chunked via Starlette `FileResponse`, so memory usage is constant regardless of MP4 size.

---

## Programmatic usage examples

### Bash / curl

```bash
# List templates
curl http://localhost:8765/

# Submit a form (no image)
curl -X POST http://localhost:8765/preview/cloud-render \
  -F "user_question=What is OpenVideoKit?" \
  -F "filename=intro.mp4"

# Trigger a render
curl -X POST http://localhost:8765/render/<session_id>

# Download the MP4 once status == done
curl -OJ http://localhost:8765/download/<job_id>
```

### Python (requests)

```python
import requests

base = "http://localhost:8765"
s = requests.Session()

# Submit form
r = s.post(f"{base}/preview/cloud-render",
           data={"user_question": "Demo question", "filename": "x.mp4"},
           allow_redirects=False)
session_id = r.headers["location"].rsplit("/", 1)[-1]

# Trigger render
r = s.post(f"{base}/render/{session_id}", allow_redirects=False)
job_id = r.headers["location"].rsplit("/", 1)[-1]

# Poll (or use the auto-refreshing /job/<job_id> in a browser)
import time
while True:
    r = s.get(f"{base}/job/{job_id}")
    if "Status:</b> done" in r.text:
        break
    if "Status:</b> failed" in r.text:
        raise RuntimeError("render failed")
    time.sleep(3)

# Download MP4
r = s.get(f"{base}/download/{job_id}", stream=True)
with open("out.mp4", "wb") as f:
    for chunk in r.iter_content(64 * 1024):
        f.write(chunk)
```

See `scripts/test-e2e.py` for the full reference implementation.
