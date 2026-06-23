"""FastAPI app — all HTTP routes for OpenVideoKit.

Routes:
  GET  /                              — info + list templates
  GET  /editor/{template_id}          — auto-generated form from schema
  POST /preview/{template_id}         — stamp session, redirect to preview
  GET  /preview/{session_id}          — <hyperframes-player> wrapper
  GET  /session/{session_id}/{path}   — serve session files (composition + assets)
  POST /render/{session_id}           — spawn hyperframes render
  GET  /job/{job_id}                  — auto-refreshing job status
  GET  /job/{job_id}/log              — render log
  GET  /download/{job_id}             — stream finished MP4
"""

from __future__ import annotations

import json
import shutil
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    RedirectResponse,
    Response,
)

from . import rendering, templating
from .config import (
    SESSIONS_DIR,
    TEMPLATES_DIR,
    ensure_data_dirs,
)

app = FastAPI(title="OpenVideoKit")
ensure_data_dirs()


# ─── 1. Home page ──────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def home() -> HTMLResponse:
    return HTMLResponse(templating.render_home_page(
        templates=templating.list_templates(),
        sessions=templating.list_recent_sessions(),
        jobs=rendering.list_recent_jobs(),
    ))


@app.get("/api")
async def api_info() -> dict:
    return {
        "name": "OpenVideoKit",
        "templates": [t["id"] for t in templating.list_templates()],
        "endpoints": {
            "editor":   "/editor/{template_id}",
            "preview":  "POST /preview/{template_id}",
            "render":   "POST /render/{session_id}",
            "job":      "/job/{job_id}",
            "download": "/download/{job_id}",
        },
    }


@app.get("/api/templates/{template_id}")
async def api_template_detail(template_id: str) -> dict:
    """Return the full template.json schema for a single template."""
    try:
        return templating.load_template_meta(template_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


# ─── 2. Editor — form auto-generated from template.json ────────────────────
@app.get("/editor/{template_id}", response_class=HTMLResponse)
async def editor(template_id: str) -> HTMLResponse:
    try:
        meta = templating.load_template_meta(template_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    return HTMLResponse(templating.render_editor_page(meta, template_id))


# ─── 3. Preview POST — stamp session, redirect ─────────────────────────────
@app.post("/preview/{template_id}")
async def create_preview(template_id: str, request: Request) -> RedirectResponse:
    try:
        meta = templating.load_template_meta(template_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e

    template_dir = TEMPLATES_DIR / template_id
    if not template_dir.is_dir():
        raise HTTPException(404, f"template dir '{template_id}' missing")

    session_id = uuid.uuid4().hex[:12]
    session_dir = SESSIONS_DIR / session_id
    shutil.copytree(template_dir, session_dir)

    form = await request.form()
    form_values: dict[str, str] = {}
    uploads: dict[str, bytes] = {}
    upload_meta: dict[str, dict] = {}
    for slot in meta["slots"]:
        sid = slot["id"]
        if slot["type"] == "text":
            form_values[sid] = str(form.get(sid, "") or "")
        elif slot["type"] == "image":
            f = form.get(sid)
            if f is not None and getattr(f, "filename", ""):
                uploads[sid] = await f.read()
                upload_meta[sid] = {
                    "filename": getattr(f, "filename", ""),
                    "content_type": getattr(f, "content_type", ""),
                }

    templating.stamp_session(session_dir, meta, form_values, uploads, upload_meta)
    return RedirectResponse(f"/preview/{session_id}", status_code=303)


# ─── 4. Preview wrapper ────────────────────────────────────────────────────
@app.get("/preview/{session_id}", response_class=HTMLResponse)
async def preview_page(session_id: str) -> HTMLResponse:
    session_dir = SESSIONS_DIR / session_id
    if not session_dir.is_dir():
        raise HTTPException(404, "session expired or not found")
    meta_path = session_dir / "template.json"
    meta = json.loads(meta_path.read_text()) if meta_path.is_file() else {"name": "Preview"}
    return HTMLResponse(
        templating.render_player_page(
            f"/session/{session_id}/index.html", meta.get("name", "Preview"), session_id
        )
    )


# ─── 5. Session file serving ───────────────────────────────────────────────
@app.get("/session/{session_id}/{path:path}")
async def session_file(session_id: str, path: str) -> Response:
    session_dir = (SESSIONS_DIR / session_id).resolve()
    target = (session_dir / path).resolve()
    try:
        target.relative_to(session_dir)
    except ValueError as e:
        raise HTTPException(404) from e
    if not target.is_file():
        raise HTTPException(404)
    return FileResponse(target, media_type=templating.guess_mime(target))


# ─── 6. Render — spawn hf render on session dir ────────────────────────────
@app.post("/render/{session_id}")
async def start_render_form(session_id: str) -> RedirectResponse:
    try:
        job_id = rendering.start_render(session_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    return RedirectResponse(f"/job/{job_id}", status_code=303)


# ─── 7. Job status ─────────────────────────────────────────────────────────
@app.get("/job/{job_id}", response_class=HTMLResponse)
async def job_status(job_id: str) -> HTMLResponse:
    job = rendering.get_job(job_id)
    if not job:
        raise HTTPException(404, "unknown job")
    return HTMLResponse(
        templating.render_job_page(job, job_id, rendering.job_elapsed_seconds(job))
    )


@app.get("/job/{job_id}/log", response_class=HTMLResponse)
async def job_log(job_id: str) -> HTMLResponse:
    job = rendering.get_job(job_id)
    if not job:
        raise HTTPException(404)
    return HTMLResponse(
        templating.render_log_page(job, job_id, rendering.read_job_log(job_id))
    )


# ─── 8. Download ───────────────────────────────────────────────────────────
@app.get("/download/{job_id}")
async def download(job_id: str) -> FileResponse:
    job = rendering.get_job(job_id)
    if not job or job["status"] != "done":
        raise HTTPException(404, "mp4 not ready")
    return FileResponse(job["output"], media_type="video/mp4",
                        filename=f"{job['session_id']}.mp4")
