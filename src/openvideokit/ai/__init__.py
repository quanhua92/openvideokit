"""OpenVideoKit AI subsystem — a LangGraph agent that edits the project by
emitting ``EditOp`` proposals the frontend ``EditBus`` dispatches on Accept.

See ``docs/ai.md`` for the full implementation contract.
"""

from __future__ import annotations

__all__ = ["config", "ops", "events", "context", "llm", "graph", "server"]
