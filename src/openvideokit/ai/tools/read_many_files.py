"""read_many_files — read several project files in one call (sandboxed).

Batched read for efficiency: instead of N round-trips through read_file, the
agent passes a list of paths and gets all of them back as a single result.
Same sandbox + slide-path resolution as read_file.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from .read_file import _resolve_within

if TYPE_CHECKING:
    pass

_DESCRIPTION = (
    "Read multiple project files at once. Pass a list of relative paths "
    "(e.g. ['slide-0/index.json', 'slide-1/index.html', 'project.json']). "
    "Slide-relative paths resolve under slides/. Returns one block per file "
    "with a header line; missing files are reported inline. Paths cannot "
    "escape the project directory."
)


class _Args(BaseModel):
    paths: list[str] = Field(
        description="List of relative paths inside the project, e.g. ['slide-0/index.json', 'project.json']."
    )


def build(ctx):
    def run(paths: list[str]) -> str:
        base = ctx.project_dir.resolve()
        out: list[str] = []
        for path in paths:
            target = _resolve_within(base, path)
            if target is None:
                direct = (base / path).resolve()
                try:
                    direct.relative_to(base)
                except ValueError:
                    out.append(f"── {path} ──\nERROR: path escapes the project directory\n")
                else:
                    out.append(f"── {path} ──\nERROR: not a file\n")
                continue
            data = target.read_text(encoding="utf-8", errors="replace")
            if len(data) > 200_000:
                data = data[:200_000] + "\n…[truncated]"
            out.append(f"── {path} ──\n{data}")
        return "\n\n".join(out)

    return StructuredTool.from_function(
        run, name="read_many_files", description=_DESCRIPTION, args_schema=_Args
    )
