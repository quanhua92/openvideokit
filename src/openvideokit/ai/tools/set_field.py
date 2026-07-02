"""set_field — propose a setField EditOp (PropertiesPanel parity)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..ops import set_field
from ._registry import ops_result

if TYPE_CHECKING:
    pass

_DESCRIPTION = (
    "Set a single text/color field on a slide (e.g. title, body, bg_color, "
    "accent, cta, quote). This is the cheap Tier-1 path — prefer it over "
    "set_slide_html for content changes. Produces a proposal the user accepts."
)


class _Args(BaseModel):
    slide_id: str = Field(description="Target slide id (must exist).")
    field_id: str = Field(description="Field id, e.g. 'title', 'body', 'bg_color'.")
    value: str = Field(description="The new field value.")


def build(ctx):
    def run(slide_id: str, field_id: str, value: str) -> str:
        if not ctx.slide_exists(slide_id):
            return f"ERROR: unknown slide '{slide_id}'. Known: {ctx.slide_ids}"
        if not field_id:
            return "ERROR: field_id is required"
        op = set_field(slide_id, field_id, value)
        return ops_result(
            [op],
            rationale=f"Set {slide_id}.{field_id}.",
            slide_id=slide_id,
        )

    return StructuredTool.from_function(run, name="set_field", description=_DESCRIPTION, args_schema=_Args)
