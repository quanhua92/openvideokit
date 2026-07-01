"""HTTP routes — all under `/api`.

Project JSON + stamped HF compositions + PUT (with rev check) + SSE push.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse

from . import events, store
from .composition import build_root_composition, build_slide_composition
from .store import ConflictError, compute_rev

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
    events.broadcast(project_id, {"projectId": project_id, "rev": updated["rev"]})
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
