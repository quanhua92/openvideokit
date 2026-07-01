"""Disk-backed project store — per-slide folders with write-through cache.

Disk layout::

    {OVK_DATA_DIR}/
    └── {project_id}/
        ├── project.json          ← root (canvas, theme, audio, slides[])
        └── slides/
            ├── slide-0/
            │   ├── index.json    ← {duration, fields, assets, voiceover, ...}
            │   ├── index.html    ← bare <template> HTML
            │   ├── audio.mp3     ← edge-tts output (optional)
            │   └── audio.json    ← TTS metadata (optional)
            └── ...

The API serves a combined bundle ``{rev, root, slides, slideHtml}`` — the
store splits on write and assembles on read.
"""

from __future__ import annotations

import contextlib
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
    def __init__(self, project_id: str, current: dict) -> None:
        self.project_id = project_id
        self.current = current
        super().__init__(f"rev mismatch on '{project_id}'")


# ── Paths ────────────────────────────────────────────────────────────────


def _project_dir(project_id: str) -> Path:
    return _DATA_PATH / project_id


def _root_path(project_id: str) -> Path:
    return _project_dir(project_id) / "project.json"


def _slides_dir(project_id: str) -> Path:
    return _project_dir(project_id) / "slides"


def _slide_dir(project_id: str, slide_id: str) -> Path:
    return _slides_dir(project_id) / slide_id


def audio_path(project_id: str, slide_id: str) -> Path:
    return _slide_dir(project_id, slide_id) / "audio.mp3"


# ── Atomic write ─────────────────────────────────────────────────────────


def _atomic_write(path: Path, data: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(data, encoding="utf-8")
    tmp.rename(path)


# ── Disk I/O: split / merge ──────────────────────────────────────────────


def _save_to_disk(project_id: str, bundle: dict) -> None:
    """Split bundle into root + per-slide files."""
    root = bundle["root"]
    slides = bundle.get("slides", {})
    slide_html = bundle.get("slideHtml", {})

    # Root
    _atomic_write(
        _root_path(project_id),
        json.dumps(root, ensure_ascii=False, indent=2),
    )

    # Per-slide
    for slide_id in root.get("slides", []):
        sdir = _slide_dir(project_id, slide_id)
        sdir.mkdir(parents=True, exist_ok=True)

        slide = slides.get(slide_id)
        if slide:
            _atomic_write(
                sdir / "index.json",
                json.dumps(slide, ensure_ascii=False, indent=2),
            )

        html = slide_html.get(slide_id, "")
        if html:
            _atomic_write(sdir / "index.html", html)


def _load_from_disk(project_id: str) -> dict | None:
    """Assemble bundle from root + per-slide files."""
    root_path = _root_path(project_id)
    if not root_path.is_file():
        return None
    try:
        root = json.loads(root_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None

    slides: dict[str, dict] = {}
    slide_html: dict[str, str] = {}
    for slide_id in root.get("slides", []):
        sdir = _slide_dir(project_id, slide_id)
        idx = sdir / "index.json"
        if idx.is_file():
            with contextlib.suppress(json.JSONDecodeError, OSError):
                slides[slide_id] = json.loads(idx.read_text(encoding="utf-8"))
        html = sdir / "index.html"
        if html.is_file():
            slide_html[slide_id] = html.read_text(encoding="utf-8")

    return {"root": root, "slides": slides, "slideHtml": slide_html}


def _scan_disk() -> dict[str, dict]:
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


# ── Rev ─────────────────────────────────────────────────────────────────


def compute_rev(bundle: dict) -> str:
    data = {k: bundle[k] for k in _BUNDLE_KEYS if k in bundle}
    raw = json.dumps(data, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def _with_rev(bundle: dict) -> dict:
    return {**bundle, "rev": compute_rev(bundle)}


# ── flock ───────────────────────────────────────────────────────────────


@contextmanager
def _flock(project_id: str):
    import fcntl

    lock_path = _project_dir(project_id) / ".lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_file = open(lock_path, "w")  # noqa: SIM115
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        lock_file.close()


# ── Public API ──────────────────────────────────────────────────────────


def init_store() -> None:
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
