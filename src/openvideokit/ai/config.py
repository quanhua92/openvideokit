"""Runtime configuration for the AI subsystem — all env-driven.

Standard OpenAI-compatible env names (``OPENAI_BASE_URL`` / ``OPENAI_API_KEY``)
so any compliant endpoint works without custom config: OpenAI, OpenRouter
(``https://openrouter.ai/api/v1``), Ollama (``http://localhost:11434/v1``),
vLLM, LM Studio.
"""

from __future__ import annotations

import os

# OpenAI-compatible endpoint. Default assumes openai itself.
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")

# API key. Required to use AI; an empty key yields a graceful ``error`` event
# from the agent runner (no crash).
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

# Default (Tier-1) chat model id — whatever the chosen endpoint accepts.
OVK_AI_MODEL = os.environ.get("OVK_AI_MODEL", "gpt-5.4-nano")

# Reserved for future per-tool coding-model routing (Tier-2 / set_slide_html).
# v1 uses OVK_AI_MODEL for everything.
OVK_AI_TIER2_MODEL = os.environ.get("OVK_AI_TIER2_MODEL", OVK_AI_MODEL)

# Sampling temperature for the agent.
OVK_AI_TEMPERATURE = float(os.environ.get("OVK_AI_TEMPERATURE", "0.3"))

# Cap on agent tool-calling steps per turn (bounds cost + latency).
OVK_AI_MAX_STEPS = int(os.environ.get("OVK_AI_MAX_STEPS", "8"))


def is_configured() -> bool:
    """True iff an API key is present (i.e. AI is usable)."""
    return bool(OPENAI_API_KEY)
