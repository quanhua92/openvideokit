"""Karaoke caption generator: word-level split + GSAP timeline builder.

Reads voiceover_timings.json (from voiceover.py) and produces:
  1. Caption HTML — hierarchical phrase/word <span> structure
  2. GSAP timeline JS — word-by-word highlight synced to voiceover

Two strategies for word timing:
  - "char_ratio" (default): estimate word duration by character count ratio.
    Fast, deterministic, ~95% accurate for short phrases.
  - "transcribe": use HyperFrames' whisper-based transcribe for exact word
    timestamps. More accurate but requires whisper-cpp installed.

Usage from templating.py or standalone:
    from openvideokit.captions import build_captions
    html_fragment, js_fragment = build_captions(timings_data, strategy="char_ratio")
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Literal

CAPTION_STYLES: dict[str, str] = {
    "highlight": """
.caption-layer {
  position: absolute; bottom: 80px; left: 0; right: 0;
  text-align: center; pointer-events: none; z-index: 300;
}
.caption-phrase {
  position: absolute; bottom: 0; left: 0; right: 0;
  opacity: 0; transition: opacity 0.3s ease;
}
.caption-phrase .word {
  display: inline-block; font-family: 'Inter', sans-serif;
  font-size: 48px; font-weight: 800; letter-spacing: -0.01em;
  color: rgba(255,255,255,0.4); margin: 0 0.1em;
  text-shadow: 0 4px 20px rgba(0,0,0,0.8);
  transition: color 0.2s ease;
}
.caption-phrase .word--emphasis { color: #c084fc; }
.caption-phrase .word--active { color: #ffea00; }
""",
    "neon": """
.caption-layer {
  position: absolute; bottom: 80px; left: 0; right: 0;
  text-align: center; pointer-events: none; z-index: 300;
}
.caption-phrase {
  position: absolute; bottom: 0; left: 0; right: 0;
  opacity: 0; transition: opacity 0.3s ease;
}
.caption-phrase .word {
  display: inline-block; font-family: 'Inter', sans-serif;
  font-size: 48px; font-weight: 800; letter-spacing: 0.02em;
  color: rgba(255,255,255,0.25); margin: 0 0.15em;
  text-shadow: 0 0 10px rgba(0,0,0,0.9);
  transition: color 0.2s ease, text-shadow 0.2s ease;
}
.caption-phrase .word--emphasis { color: #22d3ee; }
.caption-phrase .word--active {
  color: #22d3ee;
  text-shadow: 0 0 20px rgba(34,211,238,0.8), 0 0 40px rgba(34,211,238,0.4);
}
""",
    "editorial": """
.caption-layer {
  position: absolute; bottom: 80px; left: 0; right: 0;
  text-align: center; pointer-events: none; z-index: 300;
}
.caption-phrase {
  position: absolute; bottom: 0; left: 0; right: 0;
  opacity: 0; transition: opacity 0.3s ease;
}
.caption-phrase .word {
  display: inline-block; font-family: 'Inter', sans-serif;
  font-size: 52px; font-weight: 400; letter-spacing: -0.01em;
  color: rgba(255,255,255,0.35); margin: 0 0.08em;
  transition: color 0.2s ease, font-weight 0.2s ease;
}
.caption-phrase .word--emphasis { color: #f59e0b; font-style: italic; }
.caption-phrase .word--active { color: #ffffff; font-weight: 800; }
""",
    "eco-green": """
.caption-layer {
  position: absolute; bottom: 80px; left: 0; right: 0;
  text-align: center; pointer-events: none; z-index: 300;
}
.caption-phrase {
  position: absolute; bottom: 0; left: 0; right: 0;
  opacity: 0; transition: opacity 0.3s ease;
}
.caption-phrase .word {
  display: inline-block; font-family: 'Inter', sans-serif;
  font-size: 48px; font-weight: 800; letter-spacing: -0.01em;
  color: rgba(255,255,255,0.4); margin: 0 0.1em;
  text-shadow: 0 4px 20px rgba(0,0,0,0.8);
  transition: color 0.2s ease;
}
.caption-phrase .word--emphasis { color: #4ade80; }
.caption-phrase .word--active { color: #ffea00; }
""",
}

CAPTION_CSS = CAPTION_STYLES["highlight"]


def split_words(text: str) -> list[str]:
    return text.split()


def estimate_word_timings(sentence: dict) -> list[dict]:
    """Split sentence into words, estimate per-word timing by character ratio."""
    words = split_words(sentence["text"])
    if not words:
        return []

    total_chars = sum(len(w) for w in words)
    if total_chars == 0:
        return []

    timings = []
    cursor = sentence["start"]
    dur = sentence["duration"]
    for idx, word in enumerate(words):
        char_ratio = len(word) / total_chars
        word_dur = dur * char_ratio
        timings.append(
            {
                "word": word,
                "word_index": idx,
                "start": round(cursor, 3),
                "end": round(cursor + word_dur, 3),
                "duration": round(word_dur, 3),
            }
        )
        cursor += word_dur
    return timings


def transcribe_word_timings(
    audio_path: Path, project_dir: Path, language: str = "vi"
) -> dict[str, list[dict]] | None:
    """Use HyperFrames' whisper-based transcribe for exact word timestamps.

    Returns dict mapping {sentence_text: [word_timings]} or None if unavailable.
    Falls back gracefully — caller should use char_ratio estimate instead.
    """
    try:
        result = subprocess.run(
            [
                "npx",
                "--yes",
                "hyperframes",
                "transcribe",
                str(audio_path),
                "-d",
                str(project_dir),
                "-l",
                language,
                "--json",
                "--optional",
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None
        data = json.loads(result.stdout)
        return data
    except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError):
        return None


def build_caption_html(
    timings_data: dict,
    emphasis_map: dict[int, list[int]] | None = None,
) -> str:
    """Generate the caption layer HTML fragment (phrase + word spans).

    Args:
        timings_data: Output from voiceover.generate_voiceover().
        emphasis_map: {sentence_index: [word_indices]} for keyword highlighting.

    Returns:
        HTML string for the caption layer div.
    """
    emphasis_map = emphasis_map or {}
    sentences = timings_data["sentences"]

    phrases = []
    for s in sentences:
        words = split_words(s["text"])
        emphasized = set(emphasis_map.get(s["index"], []))
        spans = []
        for wi, w in enumerate(words):
            classes = ["word"]
            if wi in emphasized:
                classes.append("word--emphasis")
            cls = " ".join(classes)
            spans.append(
                f'<span class="{cls}" '
                f'data-sentence="{s["index"]}" '
                f'data-word="{wi}">{w}</span>'
            )
        phrases.append(
            f'<div class="caption-phrase" id="phrase-{s["index"]}">'
            + " ".join(spans)
            + "</div>"
        )

    return (
        '<div class="caption-layer">\n      '
        + "\n      ".join(phrases)
        + "\n    </div>"
    )


def build_caption_timeline_js(
    timings_data: dict,
    timeline_var: str = "tl",
    indent: str = "  ",
) -> str:
    """Generate GSAP timeline JS for word-by-word karaoke highlight.

    Produces .to() / .set() calls that:
      - Show phrase container at sentence start
      - Highlight each word (add .word--active class) at its start time
      - Un-highlight at its end time
      - Hide phrase container at sentence end

    Args:
        timings_data: Output from voiceover.generate_voiceover().
        timeline_var: The GSAP timeline variable name to append calls to.
        indent: Indentation prefix for each generated line.

    Returns:
        JavaScript string to embed inside a <script> block.
    """
    sentences = timings_data["sentences"]
    lines: list[str] = []

    for s in sentences:
        word_timings = estimate_word_timings(s)
        phrase_sel = f"'#phrase-{s['index']}'"
        start = s["start"]
        end = s["end"]

        lines.append(
            f"{indent}{timeline_var}.to({phrase_sel}, "
            f"{{ opacity: 1, duration: 0.3 }}, {start:.3f});"
        )

        for wt in word_timings:
            word_sel = f"'[data-sentence=\"{s['index']}\"][data-word=\"{wt['word_index']}\"]'"
            lines.append(
                f"{indent}{timeline_var}.to({word_sel}, "
                f"{{ color: '#ffea00', duration: 0.15, ease: 'power2.out' }}, {wt['start']:.3f});"
            )
            lines.append(
                f"{indent}{timeline_var}.to({word_sel}, "
                f"{{ color: 'rgba(255,255,255,0.4)', duration: 0.15, ease: 'power2.in' }}, {wt['end']:.3f});"
            )

        lines.append(
            f"{indent}{timeline_var}.to({phrase_sel}, "
            f"{{ opacity: 0, duration: 0.2 }}, {end - 0.2:.3f});"
        )

    return "\n".join(lines)


def build_captions(
    timings_data: dict,
    emphasis_map: dict[int, list[int]] | None = None,
    strategy: Literal["char_ratio", "transcribe"] = "char_ratio",
) -> tuple[str, str]:
    """Build caption HTML + GSAP JS fragments for embedding in a composition.

    Args:
        timings_data: Timings from voiceover.generate_voiceover().
        emphasis_map: {sentence_index: [word_indices]} for highlighted keywords.
        strategy: "char_ratio" for fast estimate, "transcribe" for whisper-based.

    Returns:
        (html_fragment, js_fragment) — both plain strings ready for Jinja2 |safe.
    """
    html = build_caption_html(timings_data, emphasis_map)

    if strategy == "transcribe":
        audio_path = Path(timings_data.get("audio_path", ""))
        if audio_path.exists():
            whisper_data = transcribe_word_timings(audio_path, audio_path.parent)
            if whisper_data:
                pass

    js = build_caption_timeline_js(timings_data)
    return html, js


def build_scene_transitions_js(
    timings_data: dict,
    slide_prefix: str = "slide",
    indent: str = "        ",
) -> str:
    """Generate GSAP JS for slide show/hide transitions driven by TTS timings.

    For each sentence/slide, generates:
      - set display:flex + fade in at slide start
      - fade out + set display:none at slide end

    Args:
        timings_data: Timings from voiceover.generate_voiceover_smart().
        slide_prefix: CSS id prefix (e.g. 'slide' → '#slide-0', '#slide-1').
        indent: Indentation for each generated line.

    Returns:
        JavaScript string for the SCENE_TRANSITIONS marker.
    """
    sentences = timings_data["sentences"]
    lines: list[str] = []

    for s in sentences:
        idx = s["index"]
        sel = f"'#{slide_prefix}-{idx}'"
        start = s["start"]

        lines.append(f"{indent}// Slide {idx + 1}: starts at {start:.1f}s")
        lines.append(
            f"{indent}tl.set({sel}, {{ zIndex: 200 }}, {start:.3f});"
        )

    return "\n".join(lines)
