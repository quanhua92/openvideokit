"""File watcher — reloads a project when ANY of its files change on disk.

Uses ``watchdog`` to monitor ``{OVK_DATA_DIR}`` recursively. When any file
changes (``project.json``, ``slides/*/index.json``, ``slides/*/index.html``,
``slides/*/audio.mp3``, etc.):

  1. Identify the project from the path
  2. ``store.reload_from_disk(project_id)`` updates the cache
  3. ``events.broadcast()`` pushes SSE to all connected clients
  4. Clients refetch + the HF player reloads

This means a background AI agent can edit any slide's ``index.json``,
``index.html``, or ``audio.mp3`` directly on disk and the frontend sees
the change in real time.

Started by ``app.py`` on FastAPI startup.  Runs in a background daemon
thread.
"""

from __future__ import annotations

from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from .config import DATA_DIR
from .store import reload_from_disk

_observer: Observer | None = None
_DATA_PATH = Path(DATA_DIR).resolve()

_WATCHED_NAMES = {"project.json", "index.json", "index.html", "audio.mp3", "audio.json"}


def _resolve_project_id(src_path: str) -> str | None:
    """Walk up from the changed file to find the project directory name."""
    try:
        p = Path(src_path).resolve()
        p.relative_to(_DATA_PATH)
    except ValueError:
        return None
    parts = p.relative_to(_DATA_PATH).parts
    if not parts:
        return None
    return parts[0]


class _ProjectFileHandler(FileSystemEventHandler):
    def on_modified(self, event) -> None:
        if event.is_directory:
            return
        self._handle(event.src_path)

    def on_created(self, event) -> None:
        if event.is_directory:
            return
        self._handle(event.src_path)

    def _handle(self, src_path: str) -> None:
        path = Path(src_path)
        if path.name not in _WATCHED_NAMES:
            return
        project_id = _resolve_project_id(src_path)
        if project_id:
            reload_from_disk(project_id)


def start_watcher() -> None:
    global _observer
    if _observer is not None:
        return
    data_dir = Path(DATA_DIR)
    data_dir.mkdir(parents=True, exist_ok=True)
    _observer = Observer()
    _observer.schedule(_ProjectFileHandler(), str(data_dir), recursive=True)
    _observer.daemon = True
    _observer.start()


def stop_watcher() -> None:
    global _observer
    if _observer is not None:
        _observer.stop()
        _observer.join(timeout=2)
        _observer = None
