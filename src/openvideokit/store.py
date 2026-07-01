"""Disk-backed project store with write-through cache + file watcher.

Project bundles live as ``{OVK_DATA_DIR}/{project_id}/project.json`` on disk.
An in-memory dict acts as a write-through cache for fast reads.

On startup: scan ``OVK_DATA_DIR`` for existing projects.  If empty, seed.

The ``rev`` is a SHA-256 hash of the bundle contents — derived, never stored
on disk.  Any mutation by any source (HTTP PUT, server-side AI agent, direct
file edit) changes the bytes → changes the hash → stale clients get 409.

A ``watchdog`` file watcher (started in app.py) reloads ``project.json`` when
an external process edits it directly → broadcasts SSE → frontend sees the
change in real time.
"""

from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager
from pathlib import Path

from .config import DATA_DIR
from .events import broadcast
from .seed import PROJECT_ID, PROJECT_NAME, fixture_project

_BUNDLE_KEYS = ("root", "slides", "slideHtml")
_DATA_PATH = Path(DATA_DIR)
_STORE: dict[str, dict] = {}


class ConflictError(Exception):
    """Raised when a PUT's expected rev doesn't match the current rev."""

    def __init__(self, project_id: str, current: dict) -> None:
        self.project_id = project_id
        self.current = current
        super().__init__(f"rev mismatch on '{project_id}'")


# ── Disk I/O ─────────────────────────────────────────────────────────────


def _project_path(project_id: str) -> Path:
    return _DATA_PATH / project_id / "project.json"


@contextmanager
def _flock(project_id: str):
    """Exclusive advisory file lock for cross-process read-check-write.

    Acquires ``LOCK_EX`` on a ``.lock`` sidecar.  Ensures two processes
    (server + AI agent) can't interleave a read-rev-check with a write.
    Advisory on POSIX — both callers must use it to be safe.
    """
    import fcntl

    lock_path = _project_path(project_id).with_suffix(".lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_file = open(lock_path, "w")  # noqa: SIM115
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        lock_file.close()


def _save_to_disk(project_id: str, bundle: dict) -> None:
    """Atomic write: temp file + rename (crash-safe on POSIX)."""
    path = _project_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {k: bundle[k] for k in _BUNDLE_KEYS if k in bundle}
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.rename(path)


def _load_from_disk(project_id: str) -> dict | None:
    path = _project_path(project_id)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _scan_disk() -> dict[str, dict]:
    """Load all projects from disk into a dict."""
    if not _DATA_PATH.is_dir():
        return {}
    result: dict[str, dict] = {}
    for entry in sorted(_DATA_PATH.iterdir()):
        if not entry.is_dir():
            continue
        bundle = _load_from_disk(entry.name)
        if bundle:
            result[entry.name] = bundle
    return result


# ── Rev ───────────────────────────────────────────────────────────────────


def compute_rev(bundle: dict) -> str:
    """SHA-256 prefix of the canonical JSON of the bundle (excludes 'rev')."""
    data = {k: bundle[k] for k in _BUNDLE_KEYS if k in bundle}
    raw = json.dumps(data, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def _with_rev(bundle: dict) -> dict:
    return {**bundle, "rev": compute_rev(bundle)}


# ── Public API ────────────────────────────────────────────────────────────


def init_store() -> None:
    """Load projects from disk; seed if empty.  Called once on startup."""
    global _STORE
    _STORE = _scan_disk()
    if not _STORE:
        bundle = fixture_project()
        _save_to_disk(PROJECT_ID, bundle)
        _STORE = {PROJECT_ID: bundle}


def list_projects() -> list[dict]:
    return [{"id": pid, "name": _name_of(p)} for pid, p in _STORE.items()]


def get_project(project_id: str) -> dict | None:
    bundle = _STORE.get(project_id)
    return _with_rev(bundle) if bundle else None


def update_project(project_id: str, bundle: dict, expected_rev: str) -> dict:
    """Replace a project bundle.  Raises ConflictError if rev is stale.

    Holds an exclusive flock: re-reads from disk (not cache) so an
    external process that wrote between our last GET and this PUT is
    detected via rev mismatch.
    """
    with _flock(project_id):
        disk = _load_from_disk(project_id)
        current = disk if disk is not None else _STORE.get(project_id)
        if current is None:
            raise KeyError(project_id)
        if compute_rev(current) != expected_rev:
            raise ConflictError(project_id, _with_rev(current))
        missing = [k for k in _BUNDLE_KEYS if k not in bundle]
        if missing:
            raise ValueError(f"bundle missing required keys: {missing}")
        stored = {k: bundle[k] for k in _BUNDLE_KEYS}
        _save_to_disk(project_id, stored)
        _STORE[project_id] = stored
    result = _with_rev(stored)
    broadcast(project_id, {"projectId": project_id, "rev": result["rev"]})
    return result


def reload_from_disk(project_id: str) -> dict | None:
    """Called by the file watcher when an external process edits project.json.

    Reloads from disk, updates the cache, and broadcasts SSE so connected
    clients refetch.  Returns the new bundle-with-rev, or None if the file
    was deleted.
    """
    bundle = _load_from_disk(project_id)
    if bundle is None:
        _STORE.pop(project_id, None)
        return None
    _STORE[project_id] = bundle
    result = _with_rev(bundle)
    broadcast(project_id, {"projectId": project_id, "rev": result["rev"]})
    return result


def _name_of(project: dict) -> str:
    return project.get("root", {}).get("name", PROJECT_NAME)
