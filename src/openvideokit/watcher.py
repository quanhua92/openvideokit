"""File watcher — reloads a project when ANY of its files change on disk.

Monitors ``{OVK_DATA_DIR}`` recursively. Handles ``on_modified``,
``on_created``, and ``on_moved`` (atomic temp-file + rename writes).

Events are debounced per project (200ms) so rapid multi-file writes
(e.g. audio.mp3 + audio.json) collapse into a single reload.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from .config import DATA_DIR
from .store import reload_from_disk

_logger = logging.getLogger(__name__)
_observer: Observer | None = None
_DATA_PATH = Path(DATA_DIR).resolve()

_WATCHED_NAMES = {"project.json", "index.json", "index.html"}

_timers: dict[str, threading.Timer] = {}


def _resolve_project_id(src_path: str) -> str | None:
    try:
        p = Path(src_path).resolve()
        p.relative_to(_DATA_PATH)
    except ValueError:
        return None
    parts = p.relative_to(_DATA_PATH).parts
    return parts[0] if parts else None


def _schedule_debounced_reload(project_id: str) -> None:
    old = _timers.pop(project_id, None)
    if old:
        old.cancel()
    t = threading.Timer(0.2, _safe_reload, args=(project_id,))
    _timers[project_id] = t
    t.daemon = True
    t.start()


def _safe_reload(project_id: str) -> None:
    _timers.pop(project_id, None)
    try:
        reload_from_disk(project_id)
    except Exception:
        _logger.exception("reload_from_disk failed for %s", project_id)


class _ProjectFileHandler(FileSystemEventHandler):
    def on_modified(self, event) -> None:
        if not event.is_directory:
            self._handle(event.src_path)

    def on_created(self, event) -> None:
        if not event.is_directory:
            self._handle(event.src_path)

    def on_moved(self, event) -> None:
        if not event.is_directory:
            self._handle(event.dest_path)

    def _handle(self, src_path: str) -> None:
        if Path(src_path).name not in _WATCHED_NAMES:
            return
        project_id = _resolve_project_id(src_path)
        if project_id:
            _schedule_debounced_reload(project_id)


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
