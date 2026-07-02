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

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from . import config
from .events import (
    DoneEvent,
    ErrorEvent,
    ProposalEvent,
    ThinkingEvent,
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

    # Trail of conversation messages, kept in sync with the live stream so we
    # can feed them into a graceful closing round if the step limit is hit.
    trail: list[BaseMessage] = list(lc_messages)
    step = 0
    hit_limit = False
    try:
        async for ev in agent.astream_events(
            {"messages": lc_messages}, version="v2"
        ):
            kind = ev["event"]
            name = ev.get("name", "")
            data = ev.get("data", {})

            # Token streaming from the chat model. Reasoning models (gpt-5,
            # o1/o3, gpt-oss, …) emit a separate "thinking"/"reasoning" stream
            # before the answer — split it out so the UI can render it dimmed.
            if kind == "on_chat_model_stream":
                chunk = data.get("chunk")
                text, thinking = _extract_text_and_thinking(chunk)
                if thinking:
                    yield event_to_sse(ThinkingEvent(type="thinking", text=thinking))  # type: ignore[misc]
                if text:
                    yield event_to_sse(TokenEvent(type="token", text=text))  # type: ignore[misc]

            elif kind == "on_chat_model_end":
                out = data.get("output")
                if isinstance(out, BaseMessage):
                    trail.append(out)

            elif kind == "on_tool_start":
                step += 1
                if step >= config.OVK_AI_MAX_STEPS:
                    # Don't hard-kill — break out and run a final no-tools
                    # round below so the user gets a real closing message.
                    hit_limit = True
                    break
                yield event_to_sse(
                    ToolStartEvent(  # type: ignore[misc]
                        type="tool_start",
                        tool=name,
                        args=_safe_args(data.get("input")),
                    )
                )

            elif kind == "on_tool_end":
                output = data.get("output")
                if isinstance(output, BaseMessage):
                    trail.append(output)
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

        if hit_limit:
            # Graceful close: one final model round with NO tools bound, so the
            # model must produce a natural-language wrap-up instead of looping
            # more tool calls. Tools are only bound inside the agent graph, so
            # calling ``model`` directly here is unbound.
            _logger.info("agent hit %d-step limit; running final no-tools round", step)
            yield event_to_sse(
                ToolStartEvent(  # type: ignore[misc]
                    type="tool_start",
                    tool="wrap_up",
                    args={"reason": "step_limit"},
                )
            )
            closer = SystemMessage(
                content=(
                    "You've reached the tool-call limit for this turn. Stop calling "
                    "tools and give the user a brief final answer: summarize what you "
                    "did, and if any change wasn't applied, say so. Do not propose "
                    "further edits right now."
                )
            )
            try:
                async for chunk in model.astream(trail + [closer]):
                    _t = getattr(chunk, "content", "")
                    if isinstance(_t, list):
                        _t = "".join(b.get("text", "") for b in _t if isinstance(b, dict))
                    if _t:
                        yield event_to_sse(TokenEvent(type="token", text=_t))  # type: ignore[misc]
                yield event_to_sse(
                    ToolEndEvent(  # type: ignore[misc]
                        type="tool_end",
                        tool="wrap_up",
                        ok=True,
                        result="final answer after step limit",
                    )
                )
            except Exception as e:  # noqa: BLE001
                _logger.warning("final round failed: %s: %s", type(e).__name__, e)
            yield event_to_sse(DoneEvent(type="done"))  # type: ignore[misc]
            return

        yield event_to_sse(DoneEvent(type="done"))  # type: ignore[misc]
    except Exception as e:  # noqa: BLE001 — surface any failure to the client
        message, level = _classify_agent_error(e)
        if level == "warning":
            # Transient/expected provider errors (429, timeout, network) — don't
            # spam the log with a full traceback; a one-line WARNING is enough.
            _logger.warning("agent run failed: %s: %s", type(e).__name__, e)
        else:
            _logger.exception("agent run failed")
        yield event_to_sse(
            ErrorEvent(type="error", message=message)  # type: ignore[misc]
        )


def _classify_agent_error(e: Exception) -> tuple[str, str]:
    """Map an agent exception to a (user_message, log_level) pair.

    Transient/expected provider errors (rate-limit, timeout, connection) get a
    friendly message + ``warning`` (no traceback). Real config/code issues
    (auth, bad request, unknown) get ``error`` and a full traceback upstream.
    """
    try:
        import openai
    except ImportError:  # pragma: no cover — openai is a hard dep via langchain-openai
        openai = None  # type: ignore[assignment]

    if openai and isinstance(e, openai.RateLimitError):
        return (
            "The AI provider is rate-limited (429). Wait a moment and try again.",
            "warning",
        )
    if openai and isinstance(e, openai.AuthenticationError):
        return ("AI authentication failed — check OPENAI_API_KEY in .env.", "error")
    if openai and isinstance(e, openai.APITimeoutError):
        return ("The AI provider timed out. Try again.", "warning")
    if openai and isinstance(e, openai.APIConnectionError):
        return (
            "Could not reach the AI provider — check OPENAI_BASE_URL and network.",
            "warning",
        )
    if openai and isinstance(e, openai.BadRequestError):
        return (f"The AI provider rejected the request: {e}", "error")
    if openai and isinstance(e, openai.APIError):
        # Generic 5xx / other API errors — often transient upstream issues.
        return (f"AI provider error: {e}", "warning")
    return (f"{type(e).__name__}: {e}", "error")


def _safe_args(input_: Any) -> dict[str, Any]:
    if isinstance(input_, dict):
        return input_
    return {}


def _extract_text_and_thinking(chunk: Any) -> tuple[str, str]:
    """Split a langchain streaming chunk into (answer_text, thinking_text).

    Reasoning models (gpt-5, o1/o3, gpt-oss, …) emit reasoning/thinking content
    alongside or before the answer. langchain/openai surfaces it in a few shapes:

      - content as a list of blocks, with blocks of type "reasoning"/"thinking"
        (and "text"/"output_text" for the answer)
      - content as a plain string (non-reasoning models)
      - reasoning tucked into additional_kwargs["reasoning_content"] /
        additional_kwargs["reasoning"] (OpenRouter / OpenAI o-series deltas)

    Returns (text, thinking) — either may be empty for a given chunk.
    """
    content = getattr(chunk, "content", "")
    text = ""
    thinking = ""

    if isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type", "text")
            if btype in ("reasoning", "thinking"):
                thinking += (
                    block.get("reasoning")
                    or block.get("thinking")
                    or block.get("text")
                    or ""
                )
            elif btype in ("text", "output_text"):
                text += block.get("text", "")
    elif isinstance(content, str):
        text = content

    # Some providers (OpenRouter, OpenAI o-series) put reasoning in
    # additional_kwargs rather than a content block.
    ak = getattr(chunk, "additional_kwargs", {}) or {}
    rc = ak.get("reasoning_content")
    if isinstance(rc, str) and rc:
        thinking += rc
    r = ak.get("reasoning")
    if isinstance(r, str) and r:
        thinking += r
    elif isinstance(r, dict):
        thinking += r.get("content") or r.get("text") or ""

    return text, thinking


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
