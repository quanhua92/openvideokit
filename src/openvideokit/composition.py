"""Assemble HyperFrames compositions in memory.

The root composition is **self-contained**: every slide is inlined directly
(no ``data-composition-src`` sub-loading).  This lets ``<hyperframes-player>``
use its *direct-timeline adapter* path — it reads ``window.__timelines`` and
drives the GSAP timeline without injecting the HF runtime.

- ``build_slide_composition`` — stamp one slide (kept for the sub-comp endpoint).
- ``build_root_composition`` — the full self-contained document the player loads.
"""

from __future__ import annotations

import re

from .stamp import stamp_many

GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"

_ROOT_SHELL = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <title>{name}</title>
  <script src="{gsap}"></script>
  <style>
    * {{ margin: 0; box-sizing: border-box; }}
    html, body {{ width: 1920px; height: 1080px; overflow: hidden;
                  background: #000; font-family: system-ui, sans-serif; }}
    #stage {{ position: relative; width: 1920px; height: 1080px; overflow: hidden; }}
  </style>
</head>
<body>
  <div id="stage"
       data-composition-id="root" data-start="0"
       data-width="1920" data-height="1080" data-duration="{total:.1f}">
{inlined_slides}
  </div>
  <script>
    window.__timelines = window.__timelines || {{}};
    (function () {{
      var tl = gsap.timeline({{ paused: true }});
{timeline}
      tl.to({{}}, {{ duration: {total:.1f} }}, 0);
      window.__timelines['root'] = tl;
    }})();
  </script>
</body>
</html>"""

_SCRIPT_RE = re.compile(r"<script\b[^>]*>.*?</script>", re.DOTALL | re.IGNORECASE)
_TEMPLATE_RE = re.compile(r"</?template\b[^>]*>", re.IGNORECASE)


def build_slide_composition(slide: dict, slide_html: str) -> str:
    """Stamp the slide's id + fields into its bare ``<template>`` sub-comp."""
    values = {"slide_id": slide["id"]}
    values.update(slide.get("fields", {}))
    return stamp_many(slide_html, values)


_DIV_RE = re.compile(r'(<div\s+data-composition-id="[^"]*")')


def _inline_slide(slide: dict, slide_html: str, z_index: int) -> str:
    """Stamp a slide, strip ``<template>`` + ``<script>``, inject absolute positioning."""
    stamped = build_slide_composition(slide, slide_html)
    stamped = _TEMPLATE_RE.sub("", stamped)
    stamped = _SCRIPT_RE.sub("", stamped)
    stamped = _DIV_RE.sub(
        rf'\1 style="position:absolute;inset:0;z-index:{z_index};"',
        stamped,
        count=1,
    )
    return f"    {stamped.strip()}"


def build_root_composition(project: dict, name: str = "Preview") -> str:
    """Build the self-contained root composition (all slides inlined)."""
    root = project["root"]
    slide_ids: list[str] = root["slides"]
    slides: dict = project["slides"]
    slide_htmls: dict = project.get("slideHtml", {})

    start = 0.0
    timings: list[tuple[str, float, float]] = []
    for sid in slide_ids:
        dur = float(slides.get(sid, {}).get("duration", 5.0))
        timings.append((sid, start, dur))
        start += dur
    total = max(start, 0.1)

    inlined = "\n".join(
        _inline_slide(slides[sid], slide_htmls.get(sid, ""), 100 - idx)
        for idx, (sid, _st, _du) in enumerate(timings)
    )

    timeline_lines: list[str] = []
    for idx, (sid, st, _du) in enumerate(timings):
        timeline_lines.append(
            f"      tl.set('[data-composition-id=\"{sid}\"]', {{ zIndex: {200 + idx} }}, {st:.1f});"
        )
        timeline_lines.append(
            f"      tl.from('[data-composition-id=\"{sid}\"] .content > *',"
            f" {{ opacity: 0, y: 40, duration: 0.4, stagger: 0.1,"
            f" ease: 'power3.out' }}, {st:.1f});"
        )

    return _ROOT_SHELL.format(
        gsap=GSAP_CDN,
        name=name,
        total=total,
        inlined_slides=inlined,
        timeline="\n".join(timeline_lines),
    )
