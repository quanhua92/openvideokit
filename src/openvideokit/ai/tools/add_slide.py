"""add_slide — propose addSlide (+ optional setSlideHtml, lint-gated)."""

from __future__ import annotations

import secrets
from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..ops import add_slide, set_field, set_slide_html
from ._lint import lint_html
from ._registry import ops_result

if TYPE_CHECKING:
    pass

_DESCRIPTION = (
    "Add a new slide after a given slide (or at the end). Optionally provide "
    "custom HTML (must pass R1–R5 lint) and/or initial field values. Produces "
    "an addSlide proposal (+ setSlideHtml + setField ops if given)."
)


class _Args(BaseModel):
    after_id: str | None = Field(
        default=None, description="Insert after this slide id; omit to append at the end."
    )
    layout_id: str = Field(default="default", description="Layout id (default 'default').")
    html: str | None = Field(
        default=None,
        description="Optional bare <template> HTML for the slide (must pass R1–R5 lint).",
    )
    fields: dict[str, str] | None = Field(
        default=None, description="Optional initial field values, e.g. {title, body}.",
    )


def build(ctx):
    def run(
        after_id: str | None = None,
        layout_id: str = "default",
        html: str | None = None,
        fields: dict[str, str] | None = None,
    ) -> str:
        if after_id is not None and not ctx.slide_exists(after_id):
            return f"ERROR: unknown after_id '{after_id}'. Known: {ctx.slide_ids}"

        new_id = f"slide-{secrets.token_hex(4)}"
        ops: list = [add_slide(new_id, layout_id, after_id)]

        if html:
            res = lint_html(html)
            if not res.ok:
                return (
                    f"ERROR: HTML failed lint {res.fired_rule_id}: "
                    f"{res.fired_rule_message}"
                )
            ops.append(set_slide_html(new_id, html))

        if fields:
            for fid, val in fields.items():
                ops.append(set_field(new_id, fid, val))

        return ops_result(
            ops,
            rationale=f"Add new slide {new_id} after {after_id or 'end'}.",
            slide_id=new_id,
        )

    return StructuredTool.from_function(run, name="add_slide", description=_DESCRIPTION, args_schema=_Args)
