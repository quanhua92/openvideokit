"""duplicate_slide — propose duplicateSlide."""

from __future__ import annotations

import secrets
from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..ops import duplicate_slide
from ._registry import ops_result

if TYPE_CHECKING:
    pass

_DESCRIPTION = "Duplicate a slide (the new copy gets a fresh id)."


class _Args(BaseModel):
    slide_id: str = Field(description="Slide id to duplicate.")


def build(ctx):
    def run(slide_id: str) -> str:
        if not ctx.slide_exists(slide_id):
            return f"ERROR: unknown slide '{slide_id}'. Known: {ctx.slide_ids}"
        new_id = f"slide-{secrets.token_hex(4)}"
        op = duplicate_slide(slide_id, new_id)
        return ops_result([op], rationale=f"Duplicate {slide_id} → {new_id}.", slide_id=new_id)

    return StructuredTool.from_function(run, name="duplicate_slide", description=_DESCRIPTION, args_schema=_Args)
