"""Unit tests for stamp.py — token stamping."""

from __future__ import annotations

from openvideokit.stamp import placeholder_for, stamp, stamp_many


class TestPlaceholderFor:
    def test_uppercases_field_id(self):
        assert placeholder_for("title") == "__OVK_TITLE__"

    def test_multi_word(self):
        assert placeholder_for("bg_color") == "__OVK_BG_COLOR__"

    def test_slide_id(self):
        assert placeholder_for("slide_id") == "__OVK_SLIDE_ID__"


class TestStamp:
    def test_replaces_token(self):
        html = "<h1>__OVK_TITLE__</h1>"
        assert stamp(html, "title", "Hello") == "<h1>Hello</h1>"

    def test_replaces_all_occurrences(self):
        html = "__OVK_TITLE__ and __OVK_TITLE__"
        assert stamp(html, "title", "Hi") == "Hi and Hi"

    def test_html_escapes_value(self):
        html = "<p>__OVK_BODY__</p>"
        result = stamp(html, "body", "<script>alert(1)</script>")
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_no_match_returns_unchanged(self):
        html = "<p>no tokens here</p>"
        assert stamp(html, "title", "Hello") == html

    def test_dollar_sign_safe(self):
        """Python str.replace is literal — no $& interpretation like JS."""
        html = "<p>__OVK_BODY__</p>"
        result = stamp(html, "body", "$100 special")
        assert result == "<p>$100 special</p>"


class TestStampMany:
    def test_stamps_multiple_fields(self):
        html = '<div id="__OVK_SLIDE_ID__"><h1>__OVK_TITLE__</h1><p>__OVK_BODY__</p></div>'
        result = stamp_many(
            html,
            {
                "slide_id": "slide-0",
                "title": "Hello",
                "body": "World",
            },
        )
        assert result == '<div id="slide-0"><h1>Hello</h1><p>World</p></div>'

    def test_empty_values(self):
        html = "<p>__OVK_BODY__</p>"
        result = stamp_many(html, {"body": ""})
        assert result == "<p></p>"
