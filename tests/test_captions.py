"""Unit tests for captions.py — timing, HTML, GSAP, CSS generation."""

from __future__ import annotations

from openvideokit.captions import (
    DEFAULT_CAPTIONS,
    build_caption_css,
    build_caption_html,
    build_caption_layer,
    build_caption_timeline_js,
    estimate_word_timings,
    split_sentences,
    split_words,
)
from openvideokit.seed import fixture_project

# ── split_sentences ──────────────────────────────────────────────────────


class TestSplitSentences:
    def test_simple(self):
        assert split_sentences("Hello world. Goodbye.") == [
            "Hello world.",
            "Goodbye.",
        ]

    def test_empty(self):
        assert split_sentences("") == []
        assert split_sentences("   ") == []

    def test_no_punctuation(self):
        assert split_sentences("Just words") == ["Just words"]

    def test_multiple_delimiters(self):
        result = split_sentences("Wait! Really? Yes.")
        assert len(result) == 3

    def test_decimal_not_split(self):
        # The regex doesn't handle decimals specially — this matches the TS behavior
        result = split_sentences("Value is 3.14 today.")
        assert len(result) == 2  # "3." and "14 today."


# ── split_words ──────────────────────────────────────────────────────────


class TestSplitWords:
    def test_basic(self):
        assert split_words("hello world") == ["hello", "world"]

    def test_extra_whitespace(self):
        assert split_words("  hello   world  ") == ["hello", "world"]

    def test_empty(self):
        assert split_words("") == []


# ── estimate_word_timings ────────────────────────────────────────────────


class TestEstimateWordTimings:
    def test_basic_timing(self):
        wt = estimate_word_timings("hello world", 0.0, 2.0)
        assert len(wt) == 2
        assert wt[0]["start"] == 0.0
        assert wt[1]["end"] == 2.0
        # "hello" (5 chars) gets more time than "world" (5 chars) — equal
        assert abs(wt[0]["dur"] - 1.0) < 0.01
        assert abs(wt[1]["dur"] - 1.0) < 0.01

    def test_proportional(self):
        wt = estimate_word_timings("a supercalifragilistic", 0.0, 2.0)
        # "a" = 1 char, "supercalifragilistic" = 20 chars → 1/21 and 20/21
        assert wt[0]["dur"] < wt[1]["dur"]

    def test_sequential(self):
        wt = estimate_word_timings("one two three", 5.0, 3.0)
        for i in range(len(wt) - 1):
            assert wt[i]["end"] == wt[i + 1]["start"]

    def test_empty(self):
        assert estimate_word_timings("", 0.0, 5.0) == []
        assert estimate_word_timings("hello", 0.0, 0.0) == []


# ── build_caption_css ────────────────────────────────────────────────────


class TestBuildCaptionCss:
    def test_has_caption_layer_class(self):
        css = build_caption_css(DEFAULT_CAPTIONS)
        assert ".caption-layer" in css

    def test_has_word_class(self):
        css = build_caption_css(DEFAULT_CAPTIONS)
        assert ".caption-layer .word" in css

    def test_resolves_font_size(self):
        settings = {**DEFAULT_CAPTIONS, "fontScale": 1.5}
        css = build_caption_css(settings)
        assert "72px" in css  # 48 * 1.5

    def test_resolves_active_color(self):
        settings = {**DEFAULT_CAPTIONS, "activeColor": "#00ff00"}
        # CSS doesn't have active color (that's in GSAP), but dim color is there
        css = build_caption_css(settings)
        assert "rgba(255, 255, 255, 0.5" in css  # dimColor + dimOpacity

    def test_no_transform_or_scale(self):
        """AGENTS.md CRITICAL RULES: no transform/scale on words."""
        css = build_caption_css(DEFAULT_CAPTIONS)
        assert "transform" not in css
        assert "scale(" not in css


# ── build_caption_html ───────────────────────────────────────────────────


class TestBuildCaptionHtml:
    def test_structure(self):
        slides_data = [
            {
                "slide_idx": 0,
                "slide_start": 0.0,
                "slide_duration": 5.0,
                "words": [
                    {"i": 0, "text": "Hello", "start": 0.0, "end": 1.0, "dur": 1.0},
                    {"i": 1, "text": "world", "start": 1.0, "end": 2.0, "dur": 1.0},
                ],
            }
        ]
        html_frag = build_caption_html(slides_data)
        assert 'class="caption-layer"' in html_frag
        assert 'id="phrase-0"' in html_frag
        assert 'id="cap-0-0"' in html_frag
        assert 'id="cap-0-1"' in html_frag
        assert "Hello" in html_frag
        assert "world" in html_frag

    def test_escapes_html(self):
        slides_data = [
            {
                "slide_idx": 0,
                "slide_start": 0.0,
                "slide_duration": 5.0,
                "words": [
                    {"i": 0, "text": "<script>", "start": 0.0, "end": 1.0, "dur": 1.0},
                ],
            }
        ]
        html_frag = build_caption_html(slides_data)
        assert "<script>" not in html_frag
        assert "&lt;script&gt;" in html_frag

    def test_empty(self):
        assert build_caption_html([]) == ""


# ── build_caption_timeline_js ────────────────────────────────────────────


class TestBuildCaptionTimelineJs:
    def test_has_opacity_tweens(self):
        slides_data = [
            {
                "slide_idx": 0,
                "slide_start": 0.0,
                "slide_duration": 5.0,
                "words": [
                    {"i": 0, "text": "Hi", "start": 0.0, "end": 0.5, "dur": 0.5},
                ],
            }
        ]
        js = build_caption_timeline_js(slides_data, DEFAULT_CAPTIONS)
        assert "opacity: 1" in js
        assert "opacity: 0" in js

    def test_has_color_tweens(self):
        slides_data = [
            {
                "slide_idx": 0,
                "slide_start": 0.0,
                "slide_duration": 5.0,
                "words": [
                    {"i": 0, "text": "Hi", "start": 0.0, "end": 0.5, "dur": 0.5},
                ],
            }
        ]
        js = build_caption_timeline_js(slides_data, DEFAULT_CAPTIONS)
        assert "#ffea00" in js  # active color
        assert "rgba(255, 255, 255, 0.5" in js  # dim color

    def test_no_className(self):
        """AGENTS.md CRITICAL RULES: no gsap className plugin."""
        slides_data = [
            {
                "slide_idx": 0,
                "slide_start": 0.0,
                "slide_duration": 5.0,
                "words": [
                    {"i": 0, "text": "Hi", "start": 0.0, "end": 0.5, "dur": 0.5},
                ],
            }
        ]
        js = build_caption_timeline_js(slides_data, DEFAULT_CAPTIONS)
        assert "className" not in js

    def test_no_transform_in_tweens(self):
        slides_data = [
            {
                "slide_idx": 0,
                "slide_start": 0.0,
                "slide_duration": 5.0,
                "words": [
                    {"i": 0, "text": "Hi", "start": 0.0, "end": 0.5, "dur": 0.5},
                ],
            }
        ]
        js = build_caption_timeline_js(slides_data, DEFAULT_CAPTIONS)
        assert "scale" not in js
        assert "transform" not in js

    def test_empty(self):
        assert build_caption_timeline_js([], DEFAULT_CAPTIONS) == ""


# ── build_caption_layer (integration) ────────────────────────────────────


class TestBuildCaptionLayer:
    def test_fixture_has_captions(self):
        project = fixture_project()
        html_frag, css, js = build_caption_layer(project)
        assert html_frag != ""
        assert css != ""
        assert js != ""
        assert "caption-layer" in html_frag
        assert ".caption-layer" in css
        assert "tl.to" in js

    def test_no_voiceover_returns_empty(self):
        project = fixture_project()
        # Strip all voiceover text
        for slide in project["slides"].values():
            slide.pop("voiceover", None)
        html_frag, css, js = build_caption_layer(project)
        assert html_frag == ""
        assert css == ""
        assert js == ""

    def test_all_slides_have_phrases(self):
        project = fixture_project()
        html_frag, _, _ = build_caption_layer(project)
        for i in range(len(project["root"]["slides"])):
            assert f'id="phrase-{i}"' in html_frag

    def test_word_ids_are_unique(self):
        project = fixture_project()
        html_frag, _, _ = build_caption_layer(project)
        # Count cap- IDs — each should appear exactly once
        import re

        ids = re.findall(r'id="(cap-\d+-\d+)"', html_frag)
        assert len(ids) == len(set(ids))
