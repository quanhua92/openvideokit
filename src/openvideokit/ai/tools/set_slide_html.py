"""set_slide_html — propose setSlideHtml (Tier-2, lint-gated)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..ops import set_slide_html
from ._lint import lint_html
from ._registry import ops_result

if TYPE_CHECKING:
    pass

_DESCRIPTION = (
    "Replace a slide's full HTML (bare <template>). Use ONLY for "
    "visual/animation changes that can't be expressed as field edits. The HTML "
    "must pass R1–R5 lint (one <template>, no <html>/<body> wrapper, has "
    "data-composition-id, no Tailwind, only known __OVK_*__ tokens)."
)


class _Args(BaseModel):
    slide_id: str = Field(description="Target slide id.")
    html: str = Field(description="New bare <template> HTML.")


def build(ctx):
    def run(slide_id: str, html: str) -> str:
        if not ctx.slide_exists(slide_id):
            return f"ERROR: unknown slide '{slide_id}'. Known: {ctx.slide_ids}"
        res = lint_html(html)
        if not res.ok:
            return f"ERROR: HTML failed lint {res.fired_rule_id}: {res.fired_rule_message}"
        op = set_slide_html(slide_id, html)
        return ops_result([op], rationale=f"Rewrote {slide_id} HTML.", slide_id=slide_id)

    return StructuredTool.from_function(run, name="set_slide_html", description=_DESCRIPTION, args_schema=_Args)
