"""Section: DYNAMIC — the current project snapshot, injected per request."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..context import OVKContext


def render(ctx: OVKContext) -> str:
    root = ctx.root
    slides = ctx.slides
    slide_ids = ctx.slide_ids

    lines = [
        "# Current project",
        "",
        f"- project_id: `{ctx.project_id}`",
        f"- active slide: `{ctx.active_slide_id}`" if ctx.active_slide_id else "- active slide: (none)",
        f"- canvas: {root.get('canvas', {})}",
        f"- caption_style: {root.get('theme', {}).get('caption_style', '?')}",
        f"- slides ({len(slide_ids)}):",
    ]

    for sid in slide_ids:
        s = slides.get(sid, {})
        fields = s.get("fields", {})
        vo = s.get("voiceover") or {}
        vo_text = (vo.get("text") or "").strip()
        vo_marker = f" voice={vo.get('voice', '?')}" if vo_text else ""
        dur = s.get("duration", "?")
        field_keys = ", ".join(fields.keys()) or "(none)"
        lines.append(
            f"  - `{sid}` (dur={dur}s, fields=[{field_keys}]{vo_marker})"
        )
        if vo_text:
            lines.append(f"      vo: {vo_text[:120]!r}")

    if ctx.pins:
        lines.append("- pins:")
        for p in ctx.pins:
            lines.append(f"  - {p.kind}: {p.value}")

    lines.append("")
    lines.append(
        "Prefer the active slide when the user says \"this slide\" / \"the "
        "title\" without naming one. Read full file contents with read_file "
        "when you need exact HTML or JSON."
    )
    return "\n".join(lines)
