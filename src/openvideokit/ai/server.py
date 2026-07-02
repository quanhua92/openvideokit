"""server — run the agent for one chat turn and stream AIStreamEvents.

``run_agent(messages, ctx)`` is the single entry point used by the SSE route.
It:
  1. Builds the model from env (or accepts an injected one — for tests).
  2. Compiles the agent with ctx-bound tools.
  3. Streams ``astream_events`` and translates langgraph events into the
     :class:`AIStreamEvent` contract:
       - on_chat_model_stream  → token
       - on_tool_start         → tool_start
       - on_tool_end           → tool_end (+ proposal if the tool returned ops)
       - final                 → done
  4. Bounds the loop at ``OVK_AI_MAX_STEPS``.

No real LLM is touched by the tests — they inject a fake model.
"""

from __future__ import annotations

import json
import logging
import secrets
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from . import config
from .events import (
    DoneEvent,
    ErrorEvent,
    ProposalEvent,
    TokenEvent,
    ToolEndEvent,
    ToolStartEvent,
    event_to_sse,
)

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from .context import OVKContext

_logger = logging.getLogger(__name__)


def _to_lc_messages(messages: list[dict[str, Any]]) -> list[BaseMessage]:
    """Convert the wire ``{role, content}`` list into langchain messages."""
    out: list[BaseMessage] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "assistant":
            out.append(AIMessage(content=content))
        else:
            out.append(HumanMessage(content=content))
    return out


async def run_agent(
    messages: list[dict[str, Any]],
    ctx: OVKContext,
    *,
    model: BaseChatModel | None = None,
) -> AsyncIterator[str]:
    """Run one agent turn; yield SSE-formatted event strings.

    Yields strings ready to write to an SSE response (each already terminated
    with ``\\n\\n``). Always terminates with ``done`` or ``error``.
    """
    if model is None:
        if not config.is_configured():
            yield event_to_sse(
                ErrorEvent(  # type: ignore[misc]
                    type="error",
                    message="OPENAI_API_KEY is not set — configure the AI provider to use AI.",
                )
            )
            return
        from .llm import build_model

        model = build_model()

    from .graph import build_agent

    agent = build_agent(model, ctx)
    lc_messages = _to_lc_messages(messages)

    step = 0
    try:
        async for ev in agent.astream_events(
            {"messages": lc_messages}, version="v2"
        ):
            kind = ev["event"]
            name = ev.get("name", "")
            data = ev.get("data", {})

            # Token streaming from the chat model.
            if kind == "on_chat_model_stream":
                chunk = data.get("chunk")
                text = getattr(chunk, "content", "") if chunk else ""
                if isinstance(text, list):  # content blocks
                    text = "".join(b.get("text", "") for b in text if isinstance(b, dict))
                if text:
                    yield event_to_sse(TokenEvent(type="token", text=text))  # type: ignore[misc]

            elif kind == "on_tool_start":
                step += 1
                if step > config.OVK_AI_MAX_STEPS:
                    yield event_to_sse(
                        ErrorEvent(  # type: ignore[misc]
                            type="error",
                            message=f"agent exceeded {config.OVK_AI_MAX_STEPS} tool steps — stopping.",
                        )
                    )
                    return
                yield event_to_sse(
                    ToolStartEvent(  # type: ignore[misc]
                        type="tool_start",
                        tool=name,
                        args=_safe_args(data.get("input")),
                    )
                )

            elif kind == "on_tool_end":
                output = data.get("output")
                # langchain wraps tool output in a ToolMessage; .content is the
                # string our tool returned.
                content = getattr(output, "content", output)
                proposal = _maybe_proposal(content, name)
                if proposal is not None:
                    yield event_to_sse(proposal)  # type: ignore[misc]
                yield event_to_sse(
                    ToolEndEvent(  # type: ignore[misc]
                        type="tool_end",
                        tool=name,
                        ok=not (isinstance(content, str) and content.startswith("ERROR:")),
                        result=_truncate(content),
                    )
                )

        yield event_to_sse(DoneEvent(type="done"))  # type: ignore[misc]
    except Exception as e:  # noqa: BLE001 — surface any failure to the client
        _logger.exception("agent run failed")
        yield event_to_sse(
            ErrorEvent(type="error", message=f"{type(e).__name__}: {e}")  # type: ignore[misc]
        )


def _safe_args(input_: Any) -> dict[str, Any]:
    if isinstance(input_, dict):
        return input_
    return {}


def _truncate(value: Any, limit: int = 400) -> str:
    s = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return s if len(s) <= limit else s[:limit] + "…"


def _maybe_proposal(tool_output: Any, tool_name: str) -> ProposalEvent | None:
    """If a tool returned an ops-result payload, build a proposal event."""
    from .tools._registry import is_ops_result

    decoded = is_ops_result(tool_output)
    if not decoded:
        return None
    proposal_id = f"prop-{secrets.token_hex(4)}"
    payload = {
        "id": proposal_id,
        "ops": decoded.get("_ovk_ops", []),
        "rationale": decoded.get("rationale", f"{tool_name} proposal."),
        "slideId": decoded.get("slideId"),
    }
    return ProposalEvent(type="proposal", edit=payload)  # type: ignore[misc]
