"""list_files — ls a slide folder or the project root (sandboxed)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    pass

_DESCRIPTION = (
    "List files in the project. With no slide_id, lists the project root "
    "(project.json + slides/). With a slide_id, lists that slide's folder "
    "(index.json, index.html, audio.mp3, audio.json, …)."
)


class _Args(BaseModel):
    slide_id: str | None = Field(
        default=None, description="Optional slide id; omit to list the project root."
    )


def build(ctx):
    def run(slide_id: str | None = None) -> str:
        base = ctx.project_dir.resolve()
        target = (base if not slide_id else base / "slides" / slide_id).resolve()
        try:
            target.relative_to(base)
        except ValueError:
            return "ERROR: path escapes the project directory"
        if not target.is_dir():
            return f"ERROR: not a directory: {target.name}"
        names = sorted(p.name + ("/" if p.is_dir() else "") for p in target.iterdir())
        return "\n".join(names) if names else "(empty)"

    return StructuredTool.from_function(run, name="list_files", description=_DESCRIPTION, args_schema=_Args)
