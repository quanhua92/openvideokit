"""In-memory project store.

No disk, no persistence — a single seed project held in a module-level dict.
Swap for a real store (filesystem / DB) in a later phase; the read API stays.
"""

from __future__ import annotations

from .seed import PROJECT_ID, PROJECT_NAME, fixture_project

_Projects = dict[str, dict]


def _bootstrap() -> _Projects:
    return {PROJECT_ID: fixture_project()}


_STORE: _Projects = _bootstrap()


def list_projects() -> list[dict]:
    """Summary rows for the project list endpoint."""
    return [{"id": pid, "name": _name_of(p)} for pid, p in _STORE.items()]


def get_project(project_id: str) -> dict | None:
    return _STORE.get(project_id)


def _name_of(_project: dict) -> str:
    return PROJECT_NAME
