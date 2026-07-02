"""Tool registry + the OvkTool base.

Every tool is a thin wrapper around a langchain ``@tool``-decorated function
that closes over an :class:`OVKContext`. ``build_tools(ctx)`` assembles the
full set (4 read-only + 10 OVK EditOp emitters) with ctx bound.

The ``prompts/tools.py`` section reads this registry via ``build_tools`` so the
prompt's tool list never drifts from the real tools.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..context import OVKContext


def build_tools(ctx: OVKContext):
    """Return the full tool list for a request, with ctx bound.

    Order: read-only tools first (explore), then OVK EditOp emitters.
    """
    from . import (
        add_slide,
        duplicate_slide,
        grep_slides,
        list_files,
        list_slides,
        read_file,
        remove_slide,
        reorder_slides,
        set_caption_settings,
        set_caption_style,
        set_duration,
        set_field,
        set_slide_html,
        set_voiceover,
    )

    read_tools = [
        read_file.build(ctx),
        list_slides.build(ctx),
        list_files.build(ctx),
        grep_slides.build(ctx),
    ]
    ovk_tools = [
        set_field.build(ctx),
        set_voiceover.build(ctx),
        set_duration.build(ctx),
        add_slide.build(ctx),
        remove_slide.build(ctx),
        duplicate_slide.build(ctx),
        reorder_slides.build(ctx),
        set_slide_html.build(ctx),
        set_caption_style.build(ctx),
        set_caption_settings.build(ctx),
    ]
    return [*read_tools, *ovk_tools]


__all__ = ["build_tools"]
