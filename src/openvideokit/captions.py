"""Caption layer generation — baked into the composition HTML.

Both the live preview (via ``<hyperframes-player>``) and the MP4 render
(``npx hyperframes render``) consume the same composition, so captions
generated here appear identically in both.

The GSAP root timeline drives word-by-word highlight via **direct color
tweens** (not className toggling) — per AGENTS.md CRITICAL RULES:
  - NO transform / scale() / font-size / text-shadow on active words
  - NO gsap className plugin
  - Direct property tweens only (color, opacity, backgroundColor)

Caption settings live in ``root.captions`` in the project bundle so they
persist to the server and survive across devices/sessions.
"""

from __future__ import annotations

import html
import re
from typing import Any

# ── Defaults (mirrors ovk-web PRESETS.highlight) ─────────────────────────

DEFAULT_CAPTIONS: dict[str, Any] = {
    "preset": "highlight",
    "activeColor": "#ffea00",
    "pillColor": "#0a0a14",
    "dimColor": "#ffffff",
    "dimOpacity": 0.5,
    "fontWeight": 900,
    "glow": 0,
    "pill": True,
    "shadow": False,
    "scrim": False,
    "letterSpacing": -0.02,
    "fontScale": 1,
}


def _get_settings(project: dict) -> dict[str, Any]:
    """Read caption settings from root.captions, falling back to defaults."""
    root = project.get("root", {})
    caps = root.get("captions")
    if caps and isinstance(caps, dict):
        return {**DEFAULT_CAPTIONS, **caps}
    return dict(DEFAULT_CAPTIONS)


# ── Text splitting ───────────────────────────────────────────────────────

_SENTENCE_RE = re.compile(r"[^.!?]*[.!?]+|\S[^.!?]*$")


def split_sentences(text: str) -> list[str]:
    """Split text into sentences (port of ovk-web splitSentences)."""
    if not text.strip():
        return []
    tokens = _SENTENCE_RE.findall(text)
    return [t.strip() for t in tokens if t.strip()]


def split_words(sentence: str) -> list[str]:
    """Naive whitespace split — punctuation stays attached."""
    return [w for w in sentence.strip().split() if w]


# ── Word timing estimation ───────────────────────────────────────────────


def estimate_word_timings(
    text: str, start: float, duration: float
) -> list[dict[str, Any]]:
    """Distribute duration across words by character ratio.

    Port of ``timeWordsByCharRatio.ts`` — pure deterministic math.
    Each word's duration is proportional to its character count.
    """
    words = split_words(text)
    if not words or duration <= 0:
        return []

    total_chars = sum(len(w) for w in words)
    if total_chars == 0:
        return []

    cursor = start
    timings: list[dict[str, Any]] = []
    for i, word in enumerate(words):
        ratio = len(word) / total_chars
        dur = ratio * duration
        word_start = cursor
        word_end = word_start + dur
        cursor = word_end
        timings.append(
            {
                "i": i,
                "text": word,
                "start": round(word_start, 3),
                "dur": round(dur, 3),
                "end": round(word_end, 3),
            }
        )
    return timings


# ── CSS generation ───────────────────────────────────────────────────────


def _hex_to_rgba(hex_color: str, alpha: float = 1.0) -> str:
    """Convert #rrggbb to rgba(r, g, b, alpha)."""
    h = hex_color.lstrip("#")
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return f"rgba({r}, {g}, {b}, {alpha})"


def build_caption_css(settings: dict[str, Any]) -> str:
    """Generate caption CSS from settings dict.

    Base word styling (font, color, shadow) lives here. Active highlighting
    (color, pill bg, glow) is driven by GSAP tweens in the timeline JS.
    """
    dim_rgba = _hex_to_rgba(settings["dimColor"], settings["dimOpacity"])
    font_size = 48 * settings["fontScale"]
    shadow_css = ""

    if settings.get("shadow"):
        shadow_css = """
    text-shadow: 0 2px 4px rgba(0,0,0,0.7), 0 4px 20px rgba(0,0,0,0.4);"""

    scrim_css = ""
    if settings.get("scrim"):
        scrim_css = """
  .caption-scrim {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 25%;
    background: linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%);
    z-index: 299;
    pointer-events: none;
  }"""

    return f""".caption-layer {{
    position: absolute;
    bottom: 8%;
    left: 0; right: 0;
    z-index: 300;
    pointer-events: none;
  }}
  .caption-layer .caption-phrase {{
    position: absolute;
    bottom: 0;
    left: 0; right: 0;
    opacity: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.15em 0.05em;
    padding: 0 6%;
  }}
  .caption-layer .word {{
    display: inline-block;
    font-size: {font_size:.0f}px;
    font-weight: {settings["fontWeight"]};
    color: {dim_rgba};
    margin: 0 0.05em;
    padding: 0.06em 0.18em;
    border-radius: 0.18em;
    letter-spacing: {settings["letterSpacing"]}em;{shadow_css}
  }}{scrim_css}"""


# ── HTML generation ──────────────────────────────────────────────────────


def build_caption_html(slides_data: list[dict[str, Any]]) -> str:
    """Generate the caption layer HTML fragment.

    Structure::

        <div class="caption-layer">
          <div class="caption-phrase" id="phrase-0">
            <span class="word" id="cap-0-0">Word</span>
            ...
          </div>
          ...
        </div>

    ``slides_data`` items: ``{slide_idx, words: [{i, text, start, end, ...}]}``
    """
    if not slides_data:
        return ""

    phrases: list[str] = []
    for sd in slides_data:
        slide_idx = sd["slide_idx"]
        word_spans: list[str] = []
        for w in sd["words"]:
            wid = f"cap-{slide_idx}-{w['i']}"
            word_spans.append(
                f'      <span class="word" id="{wid}">{html.escape(w["text"])}</span>'
            )
        phrases.append(
            f'    <div class="caption-phrase" id="phrase-{slide_idx}">\n'
            + "\n".join(word_spans)
            + "\n    </div>"
        )

    return (
        '  <div class="caption-layer">\n'
        + "\n".join(phrases)
        + "\n  </div>"
    )


# ── GSAP timeline generation ─────────────────────────────────────────────


def build_caption_timeline_js(
    slides_data: list[dict[str, Any]],
    settings: dict[str, Any],
    indent: str = "      ",
) -> str:
    """Generate GSAP direct tweens for word highlighting.

    For each slide's phrase:
      1. Show phrase (opacity 0→1) at slide start
      2. Per-word: tween color + pill bg + glow ON, then back to dim
      3. Hide phrase (opacity 1→0) before slide end

    All tweens use **direct properties** — no className, no transform.
    Pill = backgroundColor tween, glow = filter tween.
    """
    if not slides_data:
        return ""

    active = settings["activeColor"]
    dim_rgba = _hex_to_rgba(settings["dimColor"], settings["dimOpacity"])

    # Build GSAP property strings for active (highlight) and dim (rest) states
    use_pill = settings.get("pill", False)
    use_glow = settings.get("glow", 0) > 0

    active_extra = []
    dim_extra = []
    if use_pill:
        active_extra.append(f"backgroundColor: '{settings['pillColor']}'")
        dim_extra.append("backgroundColor: 'transparent'")
    if use_glow:
        glow_px = settings["glow"] * 12
        active_extra.append(
            f"filter: 'drop-shadow(0 0 {glow_px:.0f}px {active})'"
        )
        dim_extra.append("filter: 'none'")

    active_props = ", ".join([f"color: '{active}'"] + active_extra)
    dim_props = ", ".join([f"color: '{dim_rgba}'"] + dim_extra)

    lines: list[str] = []
    for sd in slides_data:
        slide_idx = sd["slide_idx"]
        slide_start = sd["slide_start"]
        slide_dur = sd["slide_duration"]
        words = sd["words"]

        phrase_sel = f"#phrase-{slide_idx}"

        # Show phrase
        lines.append(
            f"{indent}tl.to('{phrase_sel}', "
            f"{{ opacity: 1, duration: 0.3 }}, {slide_start:.3f});"
        )

        # Per-word tweens
        for w in words:
            wid = f"#cap-{slide_idx}-{w['i']}"
            w_start = w["start"]
            w_end = w["end"]
            # Cap tween duration to 40% of word duration (avoids overlap on short words)
            t_dur = min(0.15, w["dur"] * 0.4) if w["dur"] > 0 else 0.15
            # Tween to active state
            lines.append(
                f"{indent}tl.to('{wid}', "
                f"{{ {active_props}, duration: {t_dur:.3f}, ease: 'power2.out' }}, "
                f"{w_start:.3f});"
            )
            # Tween back to dim state
            lines.append(
                f"{indent}tl.to('{wid}', "
                f"{{ {dim_props}, duration: {t_dur:.3f}, ease: 'power2.in' }}, "
                f"{w_end:.3f});"
            )

        # Hide phrase just before slide ends
        hide_at = max(slide_start, slide_start + slide_dur - 0.2)
        lines.append(
            f"{indent}tl.to('{phrase_sel}', "
            f"{{ opacity: 0, duration: 0.2 }}, {hide_at:.3f});"
        )

    return "\n".join(lines)


# ── Top-level entry point ────────────────────────────────────────────────


def build_caption_layer(project: dict) -> tuple[str, str, str]:
    """Build the complete caption layer for injection into the composition.

    Returns ``(html_fragment, css_block, gsap_js)`` — all three ready to
    insert into ``_ROOT_SHELL`` placeholders. If no slide has voiceover
    text, all three strings are empty (no caption layer rendered).
    """
    root = project.get("root", {})
    slide_ids: list[str] = root.get("slides", [])
    slides: dict = project.get("slides", {})

    # Compute cumulative slide starts + word timings
    slides_data: list[dict[str, Any]] = []
    cursor = 0.0
    has_any_text = False

    for idx, sid in enumerate(slide_ids):
        slide = slides.get(sid, {})
        duration = float(slide.get("duration", 5.0))
        vo_text = ""
        vo = slide.get("voiceover")
        if vo and isinstance(vo, dict):
            vo_text = vo.get("text", "")

        if vo_text.strip():
            has_any_text = True
            sentences = split_sentences(vo_text)
            # Distribute slide duration across sentences by char count
            total_chars = sum(len(s) for s in sentences) or 1
            word_timings: list[dict[str, Any]] = []
            sent_cursor = cursor
            word_offset = 0
            for sentence in sentences:
                sent_dur = (len(sentence) / total_chars) * duration
                wt = estimate_word_timings(sentence, sent_cursor, sent_dur)
                # Offset word index so IDs are unique within the slide
                for w in wt:
                    w["i"] += word_offset
                word_timings.extend(wt)
                word_offset += len(wt)
                sent_cursor += sent_dur

            slides_data.append(
                {
                    "slide_idx": idx,
                    "slide_start": cursor,
                    "slide_duration": duration,
                    "words": word_timings,
                }
            )

        cursor += duration

    if not has_any_text:
        return "", "", ""

    settings = _get_settings(project)
    css = build_caption_css(settings)
    html_fragment = build_caption_html(slides_data)
    gsap_js = build_caption_timeline_js(slides_data, settings)

    # Prepend scrim div if enabled (behind captions, above slides)
    if settings.get("scrim"):
        html_fragment = '  <div class="caption-scrim"></div>\n' + html_fragment

    return html_fragment, css, gsap_js
