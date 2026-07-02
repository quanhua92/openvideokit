"""AIStreamEvent — the SSE event contract between the Python agent and the
frontend ``AIDock`` / ``HttpSseProvider``.

Serialized as SSE ``data: <json>\\n\\n`` lines by :func:`event_to_sse`.
"""

from __future__ import annotations

import json
from typing import Any, Literal, TypedDict


class TokenEvent(TypedDict):
    type: Literal["token"]
    text: str


class ToolStartEvent(TypedDict):
    type: Literal["tool_start"]
    tool: str
    args: dict[str, Any]


class ToolEndEvent(TypedDict):
    type: Literal["tool_end"]
    tool: str
    ok: bool
    result: Any


class ProposalEvent(TypedDict):
    type: Literal["proposal"]
    edit: dict[str, Any]  # EditProposalPayload (see ops.py)


class DoneEvent(TypedDict):
    type: Literal["done"]


class ErrorEvent(TypedDict):
    type: Literal["error"]
    message: str


AIStreamEvent = (
    TokenEvent | ToolStartEvent | ToolEndEvent | ProposalEvent | DoneEvent | ErrorEvent
)


def event_to_sse(event: AIStreamEvent) -> str:
    """Serialize an event to one SSE ``data:`` block (with trailing blank line)."""
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def parse_sse(block: str) -> AIStreamEvent | None:
    """Parse one SSE ``data: ...`` block back into an event dict.

    Returns ``None`` for keepalive/comments. Used by tests for round-trip.
    """
    line = block.strip()
    if not line or line.startswith(":"):
        return None
    if line.startswith("data:"):
        line = line[5:].strip()
    if not line:
        return None
    return json.loads(line)
