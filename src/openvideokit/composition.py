"""Assemble HyperFrames compositions in memory.

- `build_slide_composition`: stamp a single slide's `<template>` sub-comp.
- `build_root_composition`: build the multi-slide root HTML the player loads
  (GSAP + `#stage` + host divs + a root timeline that swaps z-index per slide).
"""

from __future__ import annotations

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
{host_divs}
  </div>
  <script>
    window.__timelines = window.__timelines || {{}};
    (function () {{
      var tl = gsap.timeline({{ paused: true }});
{scene}
      tl.to({{}}, {{ duration: {total:.1f} }}, 0);
      window.__timelines['root'] = tl;
    }})();
  </script>
</body>
</html>"""


def build_slide_composition(slide: dict, slide_html: str) -> str:
    """Stamp the slide's id + fields into its bare `<template>` sub-comp."""
    values = {"slide_id": slide["id"]}
    values.update(slide.get("fields", {}))
    return stamp_many(slide_html, values)


def build_root_composition(project: dict, name: str = "Preview") -> str:
    """Build the root composition that hosts every slide + drives scene swaps."""
    root = project["root"]
    slide_ids: list[str] = root["slides"]
    slides: dict = project["slides"]

    # Cumulative starts from each slide's measured duration.
    start = 0.0
    timings: list[tuple[str, float, float]] = []
    for sid in slide_ids:
        dur = float(slides.get(sid, {}).get("duration", 5.0))
        timings.append((sid, start, dur))
        start += dur
    total = max(start, 0.1)

    host_lines = [_host_div(sid, idx, st, du) for idx, (sid, st, du) in enumerate(timings)]
    scene_lines = [
        f"      tl.set('[data-composition-id=\"{sid}\"]', {{ zIndex: {200 + i} }}, {st:.1f});"
        for i, (sid, st, _du) in enumerate(timings)
    ]

    return _ROOT_SHELL.format(
        gsap=GSAP_CDN,
        name=name,
        total=total,
        host_divs="\n".join(host_lines),
        scene="\n".join(scene_lines) or "      // single slide — no scene swap needed",
    )


def _host_div(slide_id: str, idx: int, start: float, duration: float) -> str:
    z = 100 - idx
    return (
        f'    <div data-composition-id="{slide_id}"\n'
        f'         data-composition-src="compositions/{slide_id}"\n'
        f'         data-start="{start:.1f}" data-duration="{duration:.1f}"\n'
        f'         class="clip" style="position:absolute;inset:0;z-index:{z};"></div>'
    )
