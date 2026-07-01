"""File watcher — reloads project.json when an external process edits it.

Uses ``watchdog`` to monitor ``{OVK_DATA_DIR}`` for changes to
``*/project.json``.  When a file is modified or created:

  1. ``store.reload_from_disk(project_id)`` updates the cache
  2. ``events.broadcast()`` pushes SSE to all connected clients
  3. Clients refetch + the HF player reloads

This means a background AI agent can edit ``project.json`` directly on disk
and the frontend sees the change in real time — no HTTP API needed.

Started by ``app.py`` on FastAPI startup.  Runs in a background daemon
thread so it doesn't block the event loop.
"""

from __future__ import annotations

from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from .config import DATA_DIR
from .store import reload_from_disk

_observer: Observer | None = None


class _ProjectJsonHandler(FileSystemEventHandler):
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
        if path.name != "project.json":
            return
        project_id = path.parent.name
        reload_from_disk(project_id)


def start_watcher() -> None:
    """Start watching ``OVK_DATA_DIR`` for project.json changes."""
    global _observer
    if _observer is not None:
        return
    data_dir = Path(DATA_DIR)
    data_dir.mkdir(parents=True, exist_ok=True)
    _observer = Observer()
    _observer.schedule(_ProjectJsonHandler(), str(data_dir), recursive=True)
    _observer.daemon = True
    _observer.start()


def stop_watcher() -> None:
    global _observer
    if _observer is not None:
        _observer.stop()
        _observer.join(timeout=2)
        _observer = None
