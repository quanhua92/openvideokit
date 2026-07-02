"""set_caption_settings — propose setCaptionSettings (CaptionLayer parity).

Rejects the banned active-state keys that cause layout shift (transform,
scale, font-size, text-shadow) per AGENTS.md CRITICAL RULES.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..ops import set_caption_settings
from ._registry import ops_result

if TYPE_CHECKING:
    pass

# Whitelisted caption-setting keys (mirrors ovk-web captionSettings store +
# captions.py DEFAULT_CAPTIONS). Anything else is rejected to keep the model
# from poking internals.
ALLOWED_KEYS = {
    "preset",
    "activeColor",
    "pillColor",
    "dimColor",
    "dimOpacity",
    "fontWeight",
    "glow",
    "pill",
    "shadow",
    "scrim",
    "letterSpacing",
    "fontScale",
}

_DESCRIPTION = (
    "Adjust caption display settings (the karaoke overlay). Allowed keys: "
    f"{sorted(ALLOWED_KEYS)}. Banned keys that cause layout shift "
    "(transform, scale, font-size, text-shadow) are always rejected."
)


class _Args(BaseModel):
    settings: dict[str, object] = Field(
        description="Partial caption settings, e.g. {activeColor: '#ffea00', glow: 2}."
    )


def build(ctx):
    def run(settings: dict[str, object]) -> str:
        if not isinstance(settings, dict) or not settings:
            return "ERROR: settings must be a non-empty object"
        bad = sorted(set(settings) - ALLOWED_KEYS)
        if bad:
            return (
                f"ERROR: unsupported caption keys {bad}. Allowed: {sorted(ALLOWED_KEYS)}"
            )
        op = set_caption_settings(dict(settings))
        return ops_result([op], rationale="Updated caption settings.")

    return StructuredTool.from_function(run, name="set_caption_settings", description=_DESCRIPTION, args_schema=_Args)
