"""Section: the available tools — AUTO-GENERATED from the tool registry.

Importing ``SECTION`` here would drift from the real tool set, so this module
exposes only ``render(ctx)``, which reads the registry and lists each tool's
name + docstring. Adding a tool anywhere in ``ai/tools/`` automatically
appears here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..context import OVKContext


def render(ctx: OVKContext) -> str:
    # Imported lazily to avoid a circular import (tools import prompts? no —
    # but tools import context/ops; keeping this lazy is safest).
    from ..tools import build_tools

    tools = build_tools(ctx)
    lines = ["# Tools", "", "You have these tools. Use them to explore and to propose edits:", ""]
    for t in tools:
        name = getattr(t, "name", str(t))
        desc = (getattr(t, "description", "") or "").strip().splitlines()
        summary = desc[0] if desc else ""
        lines.append(f"- **{name}** — {summary}")
    lines.append("")
    lines.append(
        "Tools whose name starts with `set_`/`add_`/`remove_`/`duplicate_`/"
        "`reorder_` produce EditOp proposals the user must accept. The "
        "read-only tools (read_file, read_many_files, list_slides, "
        "list_files, grep_slides) return data immediately."
    )
    lines.append("")
    lines.append("## Tool usage tips (important)")
    lines.append("")
    lines.append(
        "- **Batch your reads.** To read 2+ files, call `read_many_files` ONCE "
        "with the full path list — never call `read_file` multiple times in a "
        "row for files you already know you need."
    )
    lines.append(
        "- **Discover before editing.** When you don't know the slide ids / "
        "fields, call `list_slides` first (one call), not several `read_file`s."
    )
    lines.append(
        "- **One tool call per intent.** Don't fan out parallel reads of the "
        "same file or call read_file on a slide you already saw via list_slides."
    )
    lines.append(
        "- **Content vs. visual.** Use `set_field` for text/color values, "
        "`set_voiceover` for narration (it runs TTS), and reach for "
        "`set_slide_html` only for genuine layout/animation changes."
    )
    return "\n".join(lines)
