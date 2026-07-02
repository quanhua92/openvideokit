"""Prompts package — modular system-prompt sections, assembled in fixed order.

Each section module exports either:
  - ``SECTION: str``           (static), or
  - ``render(ctx) -> str``     (dynamic, depends on the project snapshot)

``build_system_prompt(ctx)`` composes them in the order defined by
``SECTION_ORDER``. The ``tools`` section is auto-generated from the tool
registry so the prompt never drifts from the actual tool set.

v1 uses ``.py`` modules (RFC 0002 §8 amended); markdown workspace files remain
a future option (see docs/ai.md §15).
"""

from __future__ import annotations

from types import ModuleType
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..context import OVKContext

# Section modules in composition order. Each is imported lazily inside
# build_system_prompt to keep import-time side effects out of the package.
SECTION_ORDER = [
    "role",
    "model",
    "tools",
    "caption_rules",
    "html_contract",
    "voice_rules",
    "safety",
    "project_context",
]


def build_system_prompt(ctx: OVKContext) -> str:
    """Assemble the full system prompt from the section modules."""
    from . import (
        caption_rules,
        html_contract,
        model,
        project_context,
        role,
        safety,
        tools,
        voice_rules,
    )

    modules: dict[str, ModuleType] = {
        "role": role,
        "model": model,
        "tools": tools,
        "caption_rules": caption_rules,
        "html_contract": html_contract,
        "voice_rules": voice_rules,
        "safety": safety,
        "project_context": project_context,
    }

    parts: list[str] = []
    for name in SECTION_ORDER:
        mod = modules[name]
        if hasattr(mod, "render"):
            parts.append(mod.render(ctx))  # type: ignore[attr-defined]
        elif hasattr(mod, "SECTION"):
            parts.append(mod.SECTION)
        else:
            raise AssertionError(f"prompt module {name!r} has no SECTION/render")
    return "\n\n".join(part.strip() for part in parts if part and part.strip())


__all__ = ["build_system_prompt", "SECTION_ORDER"]
