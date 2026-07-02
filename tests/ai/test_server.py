"""End-to-end agent run tests — using FakeToolModel (no real LLM).

Asserts the streamed SSE event sequence is correct for:
  - a single set_field tool call → tool_start, proposal, tool_end, done
  - a multi-step run (list_slides then set_field)
  - missing API key → graceful error (no crash)
  - model exception → graceful error

Async via asyncio.run (sync test methods) — no pytest-asyncio needed.
"""

from __future__ import annotations

import asyncio
import json

from langchain_core.messages import AIMessage

from openvideokit.ai import config
from openvideokit.ai.server import run_agent


def _collect(coro):
    """Run an async generator to completion, returning the list of SSE lines."""
    lines: list[str] = []

    async def _run():
        async for sse in coro:
            lines.append(sse)

    asyncio.run(_run())
    return lines


def _parse_events(sse_lines: list[str]) -> list[dict]:
    out = []
    for s in sse_lines:
        s = s.strip()
        if s.startswith("data:"):
            out.append(json.loads(s[5:].strip()))
    return out


class TestSingleToolCall:
    def test_set_field_emits_proposal(self, ctx, make_fake_model):
        model = make_fake_model(scripted=[
            AIMessage(content="", tool_calls=[{
                "name": "set_field",
                "args": {"slide_id": "slide-0", "field_id": "title", "value": "Hello"},
                "id": "tc1", "type": "tool_call",
            }]),
            AIMessage(content="Done — set the title to Hello."),
        ])
        lines = _collect(run_agent([{"role": "user", "content": "set title"}], ctx, model=model))
        events = _parse_events(lines)
        types = [e["type"] for e in events]
        assert "tool_start" in types
        assert "proposal" in types
        assert "done" in types
        assert types.index("tool_start") < types.index("proposal") < types.index("done")
        prop = next(e for e in events if e["type"] == "proposal")
        op = prop["edit"]["ops"][0]
        assert op["kind"] == "setField"
        assert op["slideId"] == "slide-0" and op["value"] == "Hello"
        assert prop["edit"]["rationale"]


class TestMultiStep:
    def test_read_then_propose(self, ctx, make_fake_model):
        model = make_fake_model(scripted=[
            AIMessage(content="", tool_calls=[{
                "name": "list_slides",
                "args": {},
                "id": "tc1", "type": "tool_call",
            }]),
            AIMessage(content="", tool_calls=[{
                "name": "set_field",
                "args": {"slide_id": "slide-0", "field_id": "title", "value": "Punchy"},
                "id": "tc2", "type": "tool_call",
            }]),
            AIMessage(content="Done."),
        ])
        lines = _collect(run_agent([{"role": "user", "content": "look then edit"}], ctx, model=model))
        events = _parse_events(lines)
        types = [e["type"] for e in events]
        assert types.count("tool_start") == 2
        assert types.count("proposal") == 1
        assert types[-1] == "done"


class TestMissingKey:
    def test_graceful_error_no_model(self, ctx, monkeypatch):
        monkeypatch.setattr(config, "OPENAI_API_KEY", "")
        lines = _collect(run_agent([{"role": "user", "content": "hi"}], ctx))
        events = _parse_events(lines)
        assert events and events[0]["type"] == "error"
        assert "OPENAI_API_KEY" in events[0]["message"]


class TestExceptionHandling:
    def test_model_error_surfaces(self, ctx, make_fake_model):
        class _Boom(make_fake_model):  # type: ignore[misc, valid-type]
            async def _agenerate(self, *a, **kw):
                raise RuntimeError("upstream 500")

        lines = _collect(run_agent([{"role": "user", "content": "x"}], ctx, model=_Boom()))
        events = _parse_events(lines)
        assert any(e["type"] == "error" for e in events)
        assert "upstream 500" in events[-1]["message"]
