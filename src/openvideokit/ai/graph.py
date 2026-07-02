"""LangGraph agent — a ReAct agent over the OVK tool set.

Uses ``langchain.agents.create_agent`` (the non-deprecated successor to
``langgraph.prebuilt.create_react_agent``). The agent is stateless per request;
``build_tools(ctx)`` binds the project context into every tool via closure.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from .context import OVKContext

from .prompts import build_system_prompt
from .tools import build_tools


def build_agent(model: BaseChatModel, ctx: OVKContext):
    """Compile the ReAct agent for one request.

    The system prompt is assembled from the modular ``ai/prompts/`` sections,
    including the auto-generated tool list (zero drift vs the real tools).
    """
    from langchain.agents import create_agent

    tools = build_tools(ctx)
    system_prompt = build_system_prompt(ctx)
    return create_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
    )
