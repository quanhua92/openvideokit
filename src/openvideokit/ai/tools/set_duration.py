"""set_duration — propose a setDuration EditOp."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..ops import set_duration
from ._registry import ops_result

if TYPE_CHECKING:
    pass

_DESCRIPTION = (
    "Set a slide's on-screen duration in seconds. Use when the user asks to "
    "make a slide longer/shorter. (set_voiceover sets duration automatically "
    "from measured audio — don't call set_duration right after it.)"
)


class _Args(BaseModel):
    slide_id: str = Field(description="Target slide id.")
    duration: float = Field(description="New duration in seconds (must be > 0).")


def build(ctx):
    def run(slide_id: str, duration: float) -> str:
        if not ctx.slide_exists(slide_id):
            return f"ERROR: unknown slide '{slide_id}'. Known: {ctx.slide_ids}"
        if duration <= 0:
            return "ERROR: duration must be > 0"
        op = set_duration(slide_id, float(duration))
        return ops_result([op], rationale=f"Set {slide_id} duration to {duration}s.", slide_id=slide_id)

    return StructuredTool.from_function(run, name="set_duration", description=_DESCRIPTION, args_schema=_Args)
