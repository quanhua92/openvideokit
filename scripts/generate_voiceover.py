#!/usr/bin/env python3
"""Generate voiceover MP3 + karaoke captions for a HyperFrames template.

Two-phase pipeline matching your workflow spec:

  Phase 1 (TTS):
    TEXT_PARTS + TARGET_STARTS → edge-tts per sentence →
    ffprobe durations → ffmpeg silence padding → ffmpeg concat →
    assets/voiceover.mp3 + assets/voiceover_timings.json

  Phase 2 (Captions):
    voiceover_timings.json → word-level split → char-ratio timing →
    GSAP karaoke timeline → captions HTML + JS baked into index.html

Usage:
  uv run --extra voiceover python scripts/generate_voiceover.py --template narrated-demo
  uv run --extra voiceover python scripts/generate_voiceover.py --template narrated-demo --voice vi-VN-NamMinh
  uv run --extra voiceover python scripts/generate_voiceover.py --template narrated-demo --bake

Flags:
  --bake          Inject captions directly into index.html (else writes to
                  compositions/captions.html for sub-composition loading)
  --no-captions   Skip caption generation, only produce voiceover.mp3
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from openvideokit.captions import CAPTION_CSS, build_caption_html, build_caption_timeline_js
from openvideokit.voiceover import generate_voiceover

TEXT_PARTS = [
    "Chào mừng bạn đến với OpenVideoKit.",
    "Công cụ tạo video tự động từ template HTML.",
    "Bạn chỉ cần điền form, xem trước, rồi render MP4.",
    "Không cần LLM trong luồng xử lý chính.",
    "Jinja2 stamping nhanh và hoàn toàn deterministic.",
    "Voiceover tiếng Việt được tạo bằng edge-tts.",
    "Phụ đề Karaoke đồng bộ từng từ spoken.",
    "Render cuối cùng bằng HyperFrames CLI.",
]

TARGET_STARTS = [0.5, 6.0, 11.0, 16.0, 21.0, 26.0, 31.0, 36.0]

EMPHASIS_MAP: dict[int, list[int]] = {
    0: [2],
    1: [5],
    2: [0],
    3: [1],
    4: [1],
    5: [0],
    6: [1],
    7: [4],
}

VOICE = "vi-VN-HoaiMyNeural"


def bake_captions_into_index(
    index_path: Path,
    caption_html: str,
    caption_js: str,
) -> None:
    """Inject caption HTML + GSAP JS into index.html.

    Replaces {{ captions_html|safe }} and {{ captions_js|safe }} markers if present,
    otherwise injects before </div> (root) and before window.__timelines assignment.
    """
    content = index_path.read_text(encoding="utf-8")

    if "{{ captions_html|safe }}" in content:
        content = content.replace("{{ captions_html|safe }}", caption_html)
    else:
        marker = "<!-- CAPTION_LAYER -->"
        if marker in content:
            content = content.replace(marker, caption_html)

    if "{{ captions_js|safe }}" in content:
        content = content.replace("{{ captions_js|safe }}", caption_js)
    else:
        marker = "// CAPTION_TIMELINE"
        if marker in content:
            content = content.replace(marker, caption_js)

    index_path.write_text(content, encoding="utf-8")


def write_caption_composition(
    output_path: Path,
    caption_html: str,
    caption_js: str,
    duration: float,
) -> None:
    """Write a standalone captions sub-composition HTML file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    html = f"""<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <style>{CAPTION_CSS}</style>
</head>
<body>
  <div data-composition-id="captions"
       data-start="0"
       data-width="1920"
       data-height="1080"
       data-duration="{duration}">
    {caption_html}
    <script>
      window.__timelines = window.__timelines || {{}};
      (function () {{
        var tl = gsap.timeline({{ paused: true }});
{caption_js}
        tl.to({{}}, {{ duration: {duration} }}, 0);
        window.__timelines['captions'] = tl;
      }})();
    </script>
  </div>
</body>
</html>"""
    output_path.write_text(html, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate voiceover MP3 + karaoke captions for a HyperFrames template"
    )
    parser.add_argument("--template", default="voiceover-animation", help="Template directory name")
    parser.add_argument("--voice", default=VOICE, help="edge-tts voice ID")
    parser.add_argument(
        "--base-dir",
        default=str(Path(__file__).resolve().parent.parent),
        help="Project base dir",
    )
    parser.add_argument("--bake", action="store_true", help="Bake captions into index.html")
    parser.add_argument("--no-captions", action="store_true", help="Skip caption generation")
    args = parser.parse_args()

    template_dir = Path(args.base_dir) / "templates" / args.template
    assets_dir = template_dir / "assets"
    if not template_dir.exists():
        print(f"ERROR: template dir not found: {template_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"=== Phase 1: TTS ({args.voice}) ===")
    timings = generate_voiceover(TEXT_PARTS, TARGET_STARTS, assets_dir, voice=args.voice)
    print(f"  voiceover.mp3   ({timings['total_duration']:.1f}s)")
    print(f"  {len(timings['sentences'])} sentences timed")

    if args.no_captions:
        print("\nDone (captions skipped).")
        return

    print("\n=== Phase 2: Captions ===")
    caption_html = build_caption_html(timings, EMPHASIS_MAP)
    caption_js = build_caption_timeline_js(timings, indent="        ")

    if args.bake:
        index_path = template_dir / "index.html"
        if index_path.exists():
            bake_captions_into_index(index_path, caption_html, caption_js)
            print(f"  baked into {index_path.relative_to(Path(args.base_dir))}")
        else:
            print(f"  WARNING: {index_path} not found, skipping bake")
    else:
        captions_path = template_dir / "compositions" / "captions.html"
        write_caption_composition(
            captions_path, caption_html, caption_js, timings["total_duration"]
        )
        print(f"  {captions_path.relative_to(Path(args.base_dir))}")

    print("\nDone.")


if __name__ == "__main__":
    main()
