"""remove_slide — propose removeSlide (refuses the last slide)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..ops import remove_slide
from ._registry import ops_result

if TYPE_CHECKING:
    pass

_DESCRIPTION = "Remove a slide. Refuses if it is the only slide left."


class _Args(BaseModel):
    slide_id: str = Field(description="Slide id to remove.")


def build(ctx):
    def run(slide_id: str) -> str:
        if not ctx.slide_exists(slide_id):
            return f"ERROR: unknown slide '{slide_id}'. Known: {ctx.slide_ids}"
        if len(ctx.slide_ids) <= 1:
            return "ERROR: cannot remove the last remaining slide"
        op = remove_slide(slide_id)
        return ops_result([op], rationale=f"Remove {slide_id}.", slide_id=slide_id)

    return StructuredTool.from_function(run, name="remove_slide", description=_DESCRIPTION, args_schema=_Args)
