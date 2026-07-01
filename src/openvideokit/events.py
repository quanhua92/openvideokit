"""SSE pub/sub — lightweight per-project event broadcast.

The PUT handler and file watcher both call ``broadcast()``. The watcher
runs on a **separate thread** (watchdog daemon), so we must marshal
``put_nowait`` onto the event loop via ``call_soon_threadsafe`` to avoid
corrupting ``asyncio.Queue`` internals.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections import defaultdict

_listeners: dict[str, list[asyncio.Queue]] = defaultdict(list)
_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Capture the running event loop (called from app lifespan)."""
    global _loop
    _loop = loop


def subscribe(project_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=16)
    _listeners[project_id].append(q)
    return q


def unsubscribe(project_id: str, q: asyncio.Queue) -> None:
    with contextlib.suppress(ValueError):
        _listeners[project_id].remove(q)
    if not _listeners[project_id]:
        del _listeners[project_id]


def _safe_put(q: asyncio.Queue, payload: str) -> None:
    with contextlib.suppress(asyncio.QueueFull):
        q.put_nowait(payload)


def broadcast(project_id: str, data: dict) -> None:
    """Broadcast to all subscribers. Thread-safe via call_soon_threadsafe."""
    payload = json.dumps(data)
    listeners = list(_listeners.get(project_id, []))
    if not listeners:
        return
    # Are we on the event loop thread?
    try:
        on_loop = asyncio.get_running_loop() is _loop
    except RuntimeError:
        on_loop = False  # no running loop → we're on a worker thread

    if _loop is not None and not on_loop:
        for q in listeners:
            _loop.call_soon_threadsafe(_safe_put, q, payload)
    else:
        for q in listeners:
            _safe_put(q, payload)
