"""LLM factory — builds the OpenAI-compatible chat model from env.

A single ``ChatOpenAI`` configured via ``OPENAI_BASE_URL`` / ``OPENAI_API_KEY``
covers OpenAI, OpenRouter, Ollama, vLLM, and LM Studio. When the endpoint is
OpenRouter, reasoning/thinking tokens are requested via ``extra_body`` (the
OpenRouter-specific ``reasoning`` field) so they surface in the stream.
"""

from __future__ import annotations

# ── Monkey-patch: preserve OpenRouter reasoning tokens ──────────────────
# langchain-openai's _convert_delta_to_message_chunk drops delta.reasoning
# (an OpenRouter extension). We wrap it to copy reasoning into
# additional_kwargs["reasoning_content"], which _extract_text_and_thinking
# in server.py already reads.
import langchain_openai.chat_models.base as _lc_base  # noqa: E402
from langchain_openai import ChatOpenAI

from . import config

_orig_convert = _lc_base._convert_delta_to_message_chunk


def _patched_convert(_dict, default_class):  # type: ignore[no-untyped-def]
    chunk = _orig_convert(_dict, default_class)
    reasoning = _dict.get("reasoning")
    if reasoning and isinstance(reasoning, str):
        chunk.additional_kwargs["reasoning_content"] = reasoning
    return chunk


_lc_base._convert_delta_to_message_chunk = _patched_convert


def _is_openrouter(url: str) -> bool:
    return "openrouter.ai" in url


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

    ``reasoning_effort`` is forwarded only when ``OVK_AI_REASONING_EFFORT``
    is set — passing it to a non-reasoning model raises, so it's opt-in.
    For OpenRouter, reasoning is also passed via ``extra_body`` so that
    ``delta.reasoning`` is included in streaming chunks.
    """
    model_id = model or config.OVK_AI_MODEL
    base_url = config.OPENAI_BASE_URL
    is_or = _is_openrouter(base_url)

    kwargs: dict = {
        "model": model_id,
        "api_key": config.OPENAI_API_KEY,
        "base_url": base_url,
        "temperature": config.OVK_AI_TEMPERATURE,
        "streaming": streaming,
        "timeout": timeout,
    }

    if config.OVK_AI_REASONING_EFFORT:
        if is_or:
            # OpenRouter uses a 'reasoning' dict in the request body.
            kwargs["extra_body"] = {
                "reasoning": {
                    "enabled": True,
                    "effort": config.OVK_AI_REASONING_EFFORT,
                }
            }
        else:
            kwargs["reasoning_effort"] = config.OVK_AI_REASONING_EFFORT

    return ChatOpenAI(**kwargs)


def build_tier2_model(*, streaming: bool = True) -> ChatOpenAI:
    """The Tier-2 (coding) model — reserved for set_slide_html routing.

    v1 uses the same model as Tier-1 (see docs/ai.md §15); this factory exists
    so a future per-tool routing refinement can swap it independently.
    """
    return build_model(model=config.OVK_AI_TIER2_MODEL, streaming=streaming)
