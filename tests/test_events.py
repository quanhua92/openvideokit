"""Unit tests for events.py — pub/sub SSE broadcast."""

from __future__ import annotations

from openvideokit import events


def test_subscribe_and_broadcast():
    q = events.subscribe("proj-1")
    events.broadcast("proj-1", {"rev": "abc123"})
    data = q.get_nowait()
    assert "abc123" in data
    events.unsubscribe("proj-1", q)


def test_broadcast_to_multiple_subscribers():
    q1 = events.subscribe("proj-1")
    q2 = events.subscribe("proj-1")
    events.broadcast("proj-1", {"rev": "xyz"})
    assert "xyz" in q1.get_nowait()
    assert "xyz" in q2.get_nowait()
    events.unsubscribe("proj-1", q1)
    events.unsubscribe("proj-1", q2)


def test_no_cross_project_leak():
    q = events.subscribe("proj-1")
    events.broadcast("proj-2", {"rev": "nope"})
    assert q.empty()
    events.unsubscribe("proj-1", q)


def test_cleanup_empty_listener_list():
    q = events.subscribe("proj-1")
    events.unsubscribe("proj-1", q)
    assert "proj-1" not in events._listeners
