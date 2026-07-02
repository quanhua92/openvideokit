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
        "read-only tools (read_file, list_slides, list_files, grep_slides) "
        "return data immediately."
    )
    return "\n".join(lines)
