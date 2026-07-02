"""Unit tests for ops.py — EditOp creator parity with the frontend union.

The shapes must match ovk-web/src/shared/edit/EditBus.ts exactly (camelCase),
because the frontend EditBus dispatches these dicts with no translation.
"""

from __future__ import annotations

from openvideokit.ai import ops


class TestSetField:
    def test_shape(self):
        assert ops.set_field("slide-0", "title", "Hello") == {
            "kind": "setField",
            "slideId": "slide-0",
            "fieldId": "title",
            "value": "Hello",
        }

    def test_camelcase_keys(self):
        op = ops.set_field("s1", "body", "x")
        assert "slideId" in op and "fieldId" in op
        assert "slide_id" not in op and "field_id" not in op


class TestReorderSlides:
    def test_shape(self):
        op = ops.reorder_slides(["slide-1", "slide-0"])
        assert op == {"kind": "reorderSlides", "order": ["slide-1", "slide-0"]}

    def test_copies_list(self):
        order = ["slide-0", "slide-1"]
        ops.reorder_slides(order)
        assert order == ["slide-0", "slide-1"]  # not mutated


class TestAddSlide:
    def test_with_after(self):
        assert ops.add_slide("slide-9", "default", "slide-0") == {
            "kind": "addSlide",
            "newId": "slide-9",
            "layoutId": "default",
            "afterId": "slide-0",
        }

    def test_without_after(self):
        assert ops.add_slide("slide-9", "default")["afterId"] is None


class TestRemoveSlide:
    def test_shape(self):
        assert ops.remove_slide("slide-0") == {"kind": "removeSlide", "slideId": "slide-0"}


class TestDuplicateSlide:
    def test_shape(self):
        assert ops.duplicate_slide("slide-0", "slide-9") == {
            "kind": "duplicateSlide",
            "slideId": "slide-0",
            "newId": "slide-9",
        }


class TestSetVoiceover:
    def test_all_fields_optional(self):
        op = ops.set_voiceover("slide-0")
        assert op == {
            "kind": "setVoiceover",
            "slideId": "slide-0",
            "text": None,
            "voice": None,
            "rate": None,
            "pitch": None,
            "volume": None,
        }

    def test_with_values(self):
        op = ops.set_voiceover("slide-0", text="hi", voice="en-US-AriaNeural")
        assert op["text"] == "hi"
        assert op["voice"] == "en-US-AriaNeural"


class TestSetDuration:
    def test_shape(self):
        assert ops.set_duration("slide-0", 3.5) == {
            "kind": "setDuration",
            "slideId": "slide-0",
            "duration": 3.5,
        }


class TestSetCaptionStyle:
    def test_shape(self):
        assert ops.set_caption_style("highlight") == {
            "kind": "setCaptionStyle",
            "style": "highlight",
        }


class TestSetCaptionSettings:
    def test_shape(self):
        op = ops.set_caption_settings({"activeColor": "#ffea00"})
        assert op == {
            "kind": "setCaptionSettings",
            "settings": {"activeColor": "#ffea00"},
        }


class TestSetSlideHtml:
    def test_shape(self):
        assert ops.set_slide_html("slide-0", "<template/>") == {
            "kind": "setSlideHtml",
            "slideId": "slide-0",
            "html": "<template/>",
        }


class TestKindsCoverFrontendUnion:
    """Every kind in the frontend EditBus.ts union has a Python creator."""

    def test_all_kinds_present(self):
        samples = [
            ops.set_field("s", "f", "v"),
            ops.reorder_slides(["s"]),
            ops.add_slide("s", "default"),
            ops.remove_slide("s"),
            ops.duplicate_slide("s", "s2"),
            ops.set_transition("s", None),
            ops.set_asset("s", "f", "r"),
            ops.set_voiceover("s"),
            ops.set_duration("s", 1.0),
            ops.set_caption_style("highlight"),
            ops.set_caption_settings({}),
            ops.set_slide_html("s", "<template/>"),
        ]
        kinds = {op["kind"] for op in samples}
        expected = {
            "setField", "reorderSlides", "addSlide", "removeSlide",
            "duplicateSlide", "setTransition", "setAsset", "setVoiceover",
            "setDuration", "setCaptionStyle", "setCaptionSettings", "setSlideHtml",
        }
        assert kinds == expected
