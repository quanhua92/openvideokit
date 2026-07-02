"""LLM factory — builds the OpenAI-compatible chat model from env.

A single ``ChatOpenAI`` configured via ``OPENAI_BASE_URL`` / ``OPENAI_API_KEY``
covers OpenAI, OpenRouter, Ollama, vLLM, and LM Studio. RFC 0002 §7's
two-path topology collapses into this one surface.
"""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from . import config


def build_model(
    *,
    model: str = "",
    streaming: bool = True,
    timeout: float | None = None,
) -> ChatOpenAI:
    """The default (Tier-1) chat model.

    ``model`` overrides ``OVK_AI_MODEL`` when given (used by the CLI
    ``--model`` flag). ``timeout`` bounds a single request (None = provider
    default); the CLI diagnostic passes a finite timeout so it can't hang on
    unreachable hosts.

    ``reasoning_effort`` is forwarded only when ``OVK_AI_REASONING_EFFORT`` is
    set — passing it to a non-reasoning model raises, so it's opt-in.
    """
    kwargs: dict = {
        "model": model or config.OVK_AI_MODEL,
        "api_key": config.OPENAI_API_KEY,
        "base_url": config.OPENAI_BASE_URL,
        "temperature": config.OVK_AI_TEMPERATURE,
        "streaming": streaming,
        "timeout": timeout,
    }
    if config.OVK_AI_REASONING_EFFORT:
        kwargs["reasoning_effort"] = config.OVK_AI_REASONING_EFFORT
    return ChatOpenAI(**kwargs)


def build_tier2_model(*, streaming: bool = True) -> ChatOpenAI:
    """The Tier-2 (coding) model — reserved for set_slide_html routing.

    v1 uses the same model as Tier-1 (see docs/ai.md §15); this factory exists
    so a future per-tool routing refinement can swap it independently.
    """
    return ChatOpenAI(
        model=config.OVK_AI_TIER2_MODEL,
        api_key=config.OPENAI_API_KEY,
        base_url=config.OPENAI_BASE_URL,
        temperature=config.OVK_AI_TEMPERATURE,
        streaming=streaming,
        reasoning_effort=config.OVK_AI_REASONING_EFFORT or None,
    )
