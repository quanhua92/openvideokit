"""SSE pub/sub — lightweight per-project event broadcast.

The PUT handler calls ``broadcast()`` after every mutation; the SSE endpoint
subscribes a queue per connected client.  When a server-side AI agent lands
later it calls the same path.

All callers are async (event-loop thread) so ``asyncio.Queue.put_nowait`` is
safe — no cross-thread synchronization needed.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections import defaultdict

_listeners: dict[str, list[asyncio.Queue]] = defaultdict(list)


def subscribe(project_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=16)
    _listeners[project_id].append(q)
    return q


def unsubscribe(project_id: str, q: asyncio.Queue) -> None:
    with contextlib.suppress(ValueError):
        _listeners[project_id].remove(q)
    if not _listeners[project_id]:
        del _listeners[project_id]


def broadcast(project_id: str, data: dict) -> None:
    payload = json.dumps(data)
    for q in _listeners.get(project_id, []):
        with contextlib.suppress(asyncio.QueueFull):
            q.put_nowait(payload)
