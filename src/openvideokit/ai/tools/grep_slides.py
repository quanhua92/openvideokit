"""grep_slides — regex search across slide files."""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    pass

_DESCRIPTION = (
    "Regex-search slide files. Returns file:line:match entries. Searches "
    "index.json + index.html of every slide (or one slide if slide_id given)."
)


class _Args(BaseModel):
    pattern: str = Field(description="Python regex pattern.")
    slide_id: str | None = Field(default=None, description="Optional: limit to one slide.")


def build(ctx):
    def run(pattern: str, slide_id: str | None = None) -> str:
        try:
            rx = re.compile(pattern)
        except re.error as e:
            return f"ERROR: invalid regex: {e}"
        hits = []
        ids = [slide_id] if slide_id else ctx.slide_ids
        for sid in ids:
            sdir = ctx.slide_dir(sid)
            for fname in ("index.json", "index.html"):
                f = sdir / fname
                if not f.is_file():
                    continue
                for i, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                    if rx.search(line):
                        hits.append({"file": f"{sid}/{fname}", "line": i, "match": line.strip()[:160]})
                        if len(hits) >= 50:
                            hits.append({"file": "(truncated)", "line": 0, "match": ""})
                            return json.dumps(hits, ensure_ascii=False)
        return json.dumps(hits, ensure_ascii=False)

    return StructuredTool.from_function(run, name="grep_slides", description=_DESCRIPTION, args_schema=_Args)
