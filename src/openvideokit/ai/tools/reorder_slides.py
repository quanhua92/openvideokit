"""reorder_slides — propose reorderSlides (must be a permutation)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..ops import reorder_slides
from ._registry import ops_result

if TYPE_CHECKING:
    pass

_DESCRIPTION = (
    "Reorder slides. Provide the full new order as a list of slide ids — it "
    "must contain exactly the current slide ids, just rearranged."
)


class _Args(BaseModel):
    order: list[str] = Field(description="Full new order of slide ids (a permutation).")


def build(ctx):
    def run(order: list[str]) -> str:
        current = set(ctx.slide_ids)
        incoming = set(order)
        if current != incoming:
            missing = current - incoming
            extra = incoming - current
            return (
                "ERROR: order must be a permutation of the current slide ids. "
                f"missing={sorted(missing)} extra={sorted(extra)}"
            )
        op = reorder_slides(order)
        return ops_result([op], rationale="Reordered slides.")

    return StructuredTool.from_function(run, name="reorder_slides", description=_DESCRIPTION, args_schema=_Args)
