"""list_slides — summarize the project's slide list from the snapshot."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel

if TYPE_CHECKING:
    pass

_DESCRIPTION = (
    "List all slides in the project with their duration, field ids, and "
    "whether they have a voiceover. No arguments."
)


class _Args(BaseModel):
    pass


def build(ctx):
    def run() -> str:
        rows = []
        for sid in ctx.slide_ids:
            s = ctx.slides.get(sid, {})
            fields = list(s.get("fields", {}).keys())
            vo = s.get("voiceover") or {}
            has_vo = bool((vo.get("text") or "").strip())
            rows.append(
                {
                    "id": sid,
                    "duration": s.get("duration", 5.0),
                    "fields": fields,
                    "has_voiceover": has_vo,
                    "voice": vo.get("voice") if has_vo else None,
                    "has_html": sid in ctx.project.get("slideHtml", {}),
                }
            )
        return json.dumps(rows, ensure_ascii=False)

    return StructuredTool.from_function(run, name="list_slides", description=_DESCRIPTION, args_schema=_Args)
