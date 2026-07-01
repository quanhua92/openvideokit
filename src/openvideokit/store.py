"""In-memory project store with content-hash optimistic locking.

The ``rev`` is a SHA-256 hash of the bundle contents (``root``, ``slides``,
``slideHtml``).  It is **derived**, never stored — any mutation by any source
(HTTP PUT, server-side AI agent, future disk swap) changes the bytes → changes
the hash → stale clients get 409.

Swap for a filesystem store later: read file → hash contents → same contract.
"""

from __future__ import annotations

import hashlib
import json

from .seed import PROJECT_ID, PROJECT_NAME, fixture_project

_Projects = dict[str, dict]

_BUNDLE_KEYS = ("root", "slides", "slideHtml")


def _bootstrap() -> _Projects:
    return {PROJECT_ID: fixture_project()}


_STORE: _Projects = _bootstrap()


class ConflictError(Exception):
    """Raised when a PUT's expected rev doesn't match the current rev."""

    def __init__(self, project_id: str, current: dict) -> None:
        self.project_id = project_id
        self.current = current
        super().__init__(f"rev mismatch on '{project_id}'")


def compute_rev(bundle: dict) -> str:
    """SHA-256 prefix of the canonical JSON of the bundle (excludes 'rev')."""
    data = {k: bundle[k] for k in _BUNDLE_KEYS if k in bundle}
    raw = json.dumps(data, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def _with_rev(bundle: dict) -> dict:
    return {**bundle, "rev": compute_rev(bundle)}


def list_projects() -> list[dict]:
    """Summary rows for the project list endpoint."""
    return [{"id": pid, "name": _name_of(p)} for pid, p in _STORE.items()]


def get_project(project_id: str) -> dict | None:
    bundle = _STORE.get(project_id)
    return _with_rev(bundle) if bundle else None


def upsert_project(project_id: str, bundle: dict, expected_rev: str) -> dict:
    """Replace a project bundle.  Raises ConflictError if rev is stale."""
    current = _STORE.get(project_id)
    if current is None:
        raise KeyError(project_id)
    if compute_rev(current) != expected_rev:
        raise ConflictError(project_id, _with_rev(current))
    _STORE[project_id] = {k: bundle[k] for k in _BUNDLE_KEYS if k in bundle}
    return _with_rev(_STORE[project_id])


def _name_of(_project: dict) -> str:
    return PROJECT_NAME
