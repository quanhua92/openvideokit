"""HTTP routes — all under `/api`.

Project JSON + stamped HF compositions + PUT (with rev check) + SSE push.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse

from . import events, rendering, store
from .composition import build_root_composition, build_slide_composition
from .store import ConflictError, compute_rev
from .voiceover import generate_audio

router = APIRouter(prefix="/api")


def _require(project_id: str) -> dict:
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail=f"project '{project_id}' not found")
    return project


@router.get("/projects")
def list_projects() -> list[dict]:
    return store.list_projects()


@router.get("/projects/{project_id}")
def get_project(project_id: str) -> dict:
    return _require(project_id)


@router.put("/projects/{project_id}")
async def put_project(project_id: str, body: dict) -> dict:
    if store.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=f"project '{project_id}' not found")
    expected_rev = body.get("rev")
    if expected_rev is None:
        raise HTTPException(status_code=400, detail="'rev' is required for optimistic locking")
    bundle = {k: body[k] for k in ("root", "slides", "slideHtml") if k in body}
    try:
        updated = store.update_project(project_id, bundle, expected_rev)
    except ConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail={"message": "rev mismatch", "current": exc.current},
        ) from exc
    return updated


@router.get(
    "/projects/{project_id}/composition",
    response_class=HTMLResponse,
)
def get_root_composition(project_id: str) -> str:
    project = _require(project_id)
    return build_root_composition(project)


@router.get(
    "/projects/{project_id}/composition/compositions/{slide_id}",
    response_class=HTMLResponse,
)
def get_slide_composition(project_id: str, slide_id: str) -> str:
    project = _require(project_id)
    slide = project["slides"].get(slide_id)
    if slide is None:
        raise HTTPException(status_code=404, detail=f"slide '{slide_id}' not found")
    slide_html = project.get("slideHtml", {}).get(slide_id, "")
    if not slide_html:
        raise HTTPException(status_code=404, detail=f"no html for slide '{slide_id}'")
    return build_slide_composition(slide, slide_html)


@router.get("/projects/{project_id}/events")
async def project_events(project_id: str) -> StreamingResponse:
    """SSE stream — pushes ``{projectId, rev}`` on every project mutation."""
    project = _require(project_id)
    queue = events.subscribe(project_id)

    async def stream():
        try:
            yield f"data: {json.dumps({'type': 'open', 'rev': compute_rev(project)})}\n\n"
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"data: {data}\n\n"
                except TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            events.unsubscribe(project_id, queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/projects/{project_id}/tts")
def measure_tts(project_id: str, body: dict) -> dict:
    """Generate per-slide mp3s via edge-tts + measure durations via ffprobe."""
    if store.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=f"project '{project_id}' not found")
    slides = body.get("slides", [])
    timings = generate_audio(project_id, slides)
    return {"timings": timings}


@router.get("/projects/{project_id}/slides/{slide_id}/audio")
def get_latest_slide_audio(project_id: str, slide_id: str) -> FileResponse:
    """Serve the latest cached audio for a slide (based on audio.json metadata).

    Returns 404 if no audio has been generated yet — caller should POST /tts.
    """
    import json as _json
    import logging

    from .store import _slide_dir

    sdir = _slide_dir(project_id, slide_id)
    meta = sdir / "audio.json"
    if not meta.is_file():
        raise HTTPException(status_code=404, detail=f"no audio generated for '{slide_id}'")
    try:
        data = _json.loads(meta.read_text(encoding="utf-8"))
    except (_json.JSONDecodeError, OSError):
        raise HTTPException(status_code=404, detail=f"corrupt audio.json for '{slide_id}'") from None
    thash = data.get("textHash", "")
    mp3 = sdir / f"audio-{thash}.mp3"
    if not mp3.is_file():
        raise HTTPException(status_code=404, detail=f"audio file missing for '{slide_id}'")
    logging.getLogger(__name__).debug("audio GET latest: %s/%s hash=%s", project_id, slide_id, thash)
    return FileResponse(str(mp3), media_type="audio/mpeg")


@router.get("/projects/{project_id}/slides/{slide_id}/audio/{audio_hash}")
def get_slide_audio(project_id: str, slide_id: str, audio_hash: str) -> FileResponse:
    """Stream a slide's content-addressed mp3 (audio-{hash}.mp3)."""
    from .store import _slide_dir

    mp3 = _slide_dir(project_id, slide_id) / f"audio-{audio_hash}.mp3"
    if not mp3.is_file():
        raise HTTPException(status_code=404, detail=f"no audio for '{slide_id}/{audio_hash}'")
    return FileResponse(str(mp3), media_type="audio/mpeg")


# ── Export / render jobs ─────────────────────────────────────────────────


@router.post("/projects/{project_id}/export", status_code=202)
def start_export(project_id: str) -> dict:
    """Enqueue an MP4 render job. Returns immediately with job_id."""
    project = _require(project_id)
    job_id = rendering.enqueue_render(project, project_id)
    return {"job_id": job_id, "status": "queued"}


@router.get("/projects/{project_id}/export/jobs")
def list_export_jobs(project_id: str) -> list[dict]:
    """List all export jobs for a project, most recent first."""
    _require(project_id)
    return rendering.list_jobs(project_id)


@router.get("/projects/{project_id}/export/jobs/{job_id}")
def get_export_job(project_id: str, job_id: str) -> dict:
    job = rendering.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"job '{job_id}' not found")
    # Enforce ownership (skip for pre-restart reconstructed jobs)
    jp = job.get("project_id", "")
    if jp not in (project_id, "(unknown — pre-restart)"):
        raise HTTPException(status_code=404, detail=f"job '{job_id}' not found")
    return job


@router.post("/projects/{project_id}/export/jobs/{job_id}/cancel")
def cancel_export(project_id: str, job_id: str) -> dict:
    job = rendering.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"job '{job_id}' not found")
    jp = job.get("project_id", "")
    if jp not in (project_id, "(unknown — pre-restart)"):
        raise HTTPException(status_code=404, detail=f"job '{job_id}' not found")
    return rendering.cancel_job(job_id)


@router.get("/projects/{project_id}/export/jobs/{job_id}/download")
def download_export(project_id: str, job_id: str) -> FileResponse:
    job = rendering.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"job '{job_id}' not found")
    jp = job.get("project_id", "")
    if jp not in (project_id, "(unknown — pre-restart)"):
        raise HTTPException(status_code=404, detail=f"job '{job_id}' not found")
    if job.get("status") != "done":
        raise HTTPException(status_code=404, detail="mp4 not ready")
    return FileResponse(
        job["output"],
        media_type="video/mp4",
        filename=f"{project_id}-{job_id}.mp4",
    )


@router.get("/projects/{project_id}/export/jobs/{job_id}/log")
def get_export_log(project_id: str, job_id: str) -> dict:
    job = rendering.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"job '{job_id}' not found")
    jp = job.get("project_id", "")
    if jp not in (project_id, "(unknown — pre-restart)"):
        raise HTTPException(status_code=404, detail=f"job '{job_id}' not found")
    return {"log": rendering.read_job_log(job_id)}


# ── AI chat (LangGraph agent → SSE stream) ───────────────────────────────


@router.post("/projects/{project_id}/ai/chat")
async def ai_chat(project_id: str, body: dict) -> StreamingResponse:
    """Run one AI agent turn; stream AIStreamEvents as SSE.

    Body: ``{messages: [{role, content}], activeSlideId?: str, pins?: [{kind, value}]}``.
    The agent runs stateless per request and never writes the document — it
    emits EditOp proposals the frontend EditBus dispatches on Accept.
    """
    project = _require(project_id)
    messages = body.get("messages") or []
    if not messages:
        raise HTTPException(status_code=400, detail="'messages' is required")

    from .ai.context import OVKContext, Pin
    from .ai.server import run_agent

    pins = [Pin(kind=p.get("kind", "slide"), value=p.get("value", "")) for p in (body.get("pins") or [])]
    ctx = OVKContext(
        project_id=project_id,
        project=project,
        active_slide_id=body.get("activeSlideId"),
        pins=pins,
    )

    async def stream():
        # Leading open + trailing done/error are emitted by run_agent itself.
        yield "data: " + json.dumps({"type": "open"}) + "\n\n"
        async for sse_line in run_agent(messages, ctx):
            yield sse_line

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
