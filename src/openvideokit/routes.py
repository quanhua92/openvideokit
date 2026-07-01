"""HTTP routes — all under `/api`.

Project JSON + stamped HF compositions served from the in-memory store.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from . import store
from .composition import build_root_composition, build_slide_composition

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
