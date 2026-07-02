"""read_file — read a project file by relative path (sandboxed)."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from ..context import OVKContext

_DESCRIPTION = (
    "Read a file from the current project by relative path. Examples: "
    "'project.json', 'slide-0/index.json', 'slide-0/index.html', "
    "'slide-0/audio.json'. Slide-relative paths are auto-resolved under the "
    "slides/ folder. Paths cannot escape the project directory."
)


class _Args(BaseModel):
    path: str = Field(description="Relative path inside the project, e.g. 'slide-0/index.json'.")


def _resolve_within(base: Path, path: str) -> Path | None:
    """Resolve a project-relative path, trying slides/<id>/ for slide files.

    The on-disk layout is ``{project}/slides/{slide_id}/index.json``; callers
    pass ``{slide_id}/index.json``. This tries the literal path first, then
    the ``slides/``-prefixed form.
    """
    for candidate in (base / path, base / "slides" / path):
        resolved = candidate.resolve()
        try:
            resolved.relative_to(base.resolve())
        except ValueError:
            continue
        if resolved.is_file():
            return resolved
    return None


def build(ctx: OVKContext) -> StructuredTool:
    def run(path: str) -> str:
        base = ctx.project_dir.resolve()
        target = _resolve_within(base, path)
        if target is None:
            # Distinguish "escapes sandbox" from "missing"
            direct = (base / path).resolve()
            try:
                direct.relative_to(base)
            except ValueError:
                return f"ERROR: path '{path}' escapes the project directory"
            return f"ERROR: not a file: '{path}'"
        data = target.read_text(encoding="utf-8", errors="replace")
        if len(data) > 200_000:
            data = data[:200_000] + "\n…[truncated]"
        return data

    return StructuredTool.from_function(run, name="read_file", description=_DESCRIPTION, args_schema=_Args)
