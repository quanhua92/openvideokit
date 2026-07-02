"""set_caption_style — propose setCaptionStyle (root theme)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..ops import set_caption_style
from ._registry import ops_result

if TYPE_CHECKING:
    pass

KNOWN_STYLES = {"highlight", "neon", "editorial", "eco-green"}

_DESCRIPTION = (
    "Set the project's caption style preset (a root-level theme value). "
    f"Known styles: {sorted(KNOWN_STYLES)}."
)


class _Args(BaseModel):
    style: str = Field(description="Caption style preset id.")


def build(ctx):
    def run(style: str) -> str:
        if style not in KNOWN_STYLES:
            return f"ERROR: unknown caption style '{style}'. Known: {sorted(KNOWN_STYLES)}"
        op = set_caption_style(style)
        return ops_result([op], rationale=f"Caption style → {style}.")

    return StructuredTool.from_function(run, name="set_caption_style", description=_DESCRIPTION, args_schema=_Args)
