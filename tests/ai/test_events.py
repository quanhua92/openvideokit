"""Unit tests for events.py — SSE serialization + round-trip."""

from __future__ import annotations

from openvideokit.ai import events
from openvideokit.ai.events import (
    DoneEvent,
    ErrorEvent,
    ProposalEvent,
    TokenEvent,
    ToolEndEvent,
    ToolStartEvent,
)


class TestEventToSse:
    def test_token(self):
        s = events.event_to_sse(TokenEvent(type="token", text="hi"))  # type: ignore[misc]
        assert s.endswith("\n\n")
        assert s.startswith("data: ")
        assert '"type":"token"' in s.replace(" ", "")
        assert '"text":"hi"' in s.replace(" ", "")

    def test_proposal(self):
        ev = ProposalEvent(  # type: ignore[misc]
            type="proposal",
            edit={"id": "p1", "ops": [{"kind": "setField", "slideId": "s0", "fieldId": "title", "value": "x"}], "rationale": "r", "slideId": "s0"},
        )
        s = events.event_to_sse(ev)
        assert '"ops"' in s

    def test_done_and_error(self):
        assert '"type":"done"' in events.event_to_sse(DoneEvent(type="done")).replace(" ", "")  # type: ignore[misc]
        assert '"message"' in events.event_to_sse(ErrorEvent(type="error", message="boom"))  # type: ignore[misc]

    def test_tool_events(self):
        assert '"tool"' in events.event_to_sse(ToolStartEvent(type="tool_start", tool="set_field", args={}))  # type: ignore[misc]
        assert '"ok"' in events.event_to_sse(ToolEndEvent(type="tool_end", tool="set_field", ok=True, result="ok"))  # type: ignore[misc]


class TestParseSse:
    def test_round_trip(self):
        original = TokenEvent(type="token", text="hello world")  # type: ignore[misc]
        wire = events.event_to_sse(original)
        # parse_sse handles the full SSE wire format ('data: {...}\n\n')
        parsed = events.parse_sse(wire)
        assert parsed == original

    def test_keepalive_is_none(self):
        assert events.parse_sse(": keepalive\n") is None
        assert events.parse_sse("") is None

    def test_proposal_round_trip(self):
        ev = ProposalEvent(  # type: ignore[misc]
            type="proposal",
            edit={"id": "p1", "ops": [{"kind": "setDuration", "slideId": "s0", "duration": 2.0}], "rationale": "x", "slideId": "s0"},
        )
        parsed = events.parse_sse(events.event_to_sse(ev))
        assert parsed == ev


class TestNonAscii:
    def test_vietnamese_survives(self):
        ev = TokenEvent(type="token", text="Xin chào — tiếng Việt")  # type: ignore[misc]
        s = events.event_to_sse(ev)
        # ensure_ascii=False keeps it readable on the wire
        assert "chào" in s
        assert events.parse_sse(s) == ev
