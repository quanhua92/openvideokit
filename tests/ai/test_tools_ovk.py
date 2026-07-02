"""Tests for the OVK EditOp-emitter tools (excluding voiceover — separate file).

Each test exercises a tool's validation gate (reject bad input) and its op
emission (correct EditOp JSON on good input), with NO LLM and NO TTS.
"""

from __future__ import annotations

from openvideokit.ai.tools import build_tools
from openvideokit.ai.tools._registry import is_ops_result


def _tool(ctx, name):
    for t in build_tools(ctx):
        if t.name == name:
            return t
    raise KeyError(name)


class TestSetField:
    def test_emits_setfield(self, ctx):
        out = _tool(ctx, "set_field").invoke(
            {"slide_id": "slide-0", "field_id": "title", "value": "Hello"}
        )
        decoded = is_ops_result(out)
        assert decoded is not None
        op = decoded["_ovk_ops"][0]
        assert op == {
            "kind": "setField", "slideId": "slide-0",
            "fieldId": "title", "value": "Hello",
        }
        assert decoded["slideId"] == "slide-0"

    def test_unknown_slide_rejected(self, ctx):
        out = _tool(ctx, "set_field").invoke(
            {"slide_id": "nope", "field_id": "title", "value": "x"}
        )
        assert out.startswith("ERROR:")
        assert is_ops_result(out) is None

    def test_empty_field_rejected(self, ctx):
        out = _tool(ctx, "set_field").invoke(
            {"slide_id": "slide-0", "field_id": "", "value": "x"}
        )
        assert out.startswith("ERROR:")


class TestSetDuration:
    def test_emits(self, ctx):
        out = _tool(ctx, "set_duration").invoke({"slide_id": "slide-0", "duration": 4.2})
        op = is_ops_result(out)["_ovk_ops"][0]
        assert op == {"kind": "setDuration", "slideId": "slide-0", "duration": 4.2}

    def test_zero_rejected(self, ctx):
        out = _tool(ctx, "set_duration").invoke({"slide_id": "slide-0", "duration": 0})
        assert out.startswith("ERROR:")

    def test_negative_rejected(self, ctx):
        out = _tool(ctx, "set_duration").invoke({"slide_id": "slide-0", "duration": -1})
        assert out.startswith("ERROR:")


class TestAddSlide:
    def test_minimal(self, ctx):
        out = _tool(ctx, "add_slide").invoke({"after_id": "slide-0"})
        decoded = is_ops_result(out)
        op = decoded["_ovk_ops"][0]
        assert op["kind"] == "addSlide"
        assert op["afterId"] == "slide-0"
        assert op["newId"].startswith("slide-")

    def test_with_html_and_fields(self, ctx):
        html = '<template><div data-composition-id="__OVK_SLIDE_ID__"><h1>__OVK_TITLE__</h1></div></template>'
        out = _tool(ctx, "add_slide").invoke(
            {"after_id": "slide-0", "html": html, "fields": {"title": "Pricing"}}
        )
        decoded = is_ops_result(out)
        kinds = [o["kind"] for o in decoded["_ovk_ops"]]
        assert "addSlide" in kinds and "setSlideHtml" in kinds and "setField" in kinds

    def test_with_voiceover_emits_setvoiceover_only(self, ctx, monkeypatch):
        # Proposal tools must NOT run TTS (docs/ai.md §6). Spy that fails if it does.
        from openvideokit import voiceover

        def _should_not_run(*a, **kw):
            raise AssertionError("generate_audio must NOT run at proposal time")

        monkeypatch.setattr(voiceover, "generate_audio", _should_not_run)
        out = _tool(ctx, "add_slide").invoke(
            {
                "after_id": "slide-0",
                "fields": {"title": "New"},
                "voiceover": {"text": "Hello world.", "voice": "en-US-AriaNeural"},
            }
        )
        decoded = is_ops_result(out)
        assert decoded is not None
        kinds = [o["kind"] for o in decoded["_ovk_ops"]]
        # addSlide + setField + setVoiceover (NO setDuration, NO TTS)
        assert "addSlide" in kinds
        assert "setField" in kinds
        assert "setVoiceover" in kinds
        assert "setDuration" not in kinds
        vo = [o for o in decoded["_ovk_ops"] if o["kind"] == "setVoiceover"][0]
        assert vo["text"] == "Hello world."

    def test_with_voiceover_bad_voice_rejected(self, ctx, monkeypatch):
        from openvideokit import voiceover

        called = []
        monkeypatch.setattr(
            voiceover, "generate_audio", lambda *a: called.append(1) or []
        )
        out = _tool(ctx, "add_slide").invoke(
            {"voiceover": {"text": "hi", "voice": "vi-VN-HoaiMy"}}
        )
        assert out.startswith("ERROR:")
        assert called == []  # TTS never ran

    def test_bad_html_rejected(self, ctx):
        out = _tool(ctx, "add_slide").invoke({"html": "<div>no template</div>"})
        assert out.startswith("ERROR:")
        assert is_ops_result(out) is None


class TestRemoveSlide:
    def test_emits(self, ctx):
        out = _tool(ctx, "remove_slide").invoke({"slide_id": "slide-2"})
        op = is_ops_result(out)["_ovk_ops"][0]
        assert op == {"kind": "removeSlide", "slideId": "slide-2"}

    def test_unknown_rejected(self, ctx):
        out = _tool(ctx, "remove_slide").invoke({"slide_id": "nope"})
        assert out.startswith("ERROR:")

    def test_last_slide_refused(self, tmp_path, monkeypatch):
        # Build a ctx with only one slide
        from openvideokit.ai.context import OVKContext
        from openvideokit.seed import fixture_project

        proj = fixture_project()
        proj["root"]["slides"] = ["slide-0"]
        ctx = OVKContext(project_id="proj-1", project=proj)
        out = _tool(ctx, "remove_slide").invoke({"slide_id": "slide-0"})
        assert "last" in out.lower()


class TestDuplicateSlide:
    def test_emits(self, ctx):
        out = _tool(ctx, "duplicate_slide").invoke({"slide_id": "slide-0"})
        op = is_ops_result(out)["_ovk_ops"][0]
        assert op["kind"] == "duplicateSlide"
        assert op["slideId"] == "slide-0"
        assert op["newId"].startswith("slide-")


class TestReorderSlides:
    def test_permutation_ok(self, ctx):
        out = _tool(ctx, "reorder_slides").invoke({"order": ["slide-2", "slide-0", "slide-1"]})
        op = is_ops_result(out)["_ovk_ops"][0]
        assert op == {"kind": "reorderSlides", "order": ["slide-2", "slide-0", "slide-1"]}

    def test_missing_id_rejected(self, ctx):
        out = _tool(ctx, "reorder_slides").invoke({"order": ["slide-0", "slide-1"]})
        assert out.startswith("ERROR:")

    def test_extra_id_rejected(self, ctx):
        out = _tool(ctx, "reorder_slides").invoke(
            {"order": ["slide-0", "slide-1", "slide-2", "slide-3"]}
        )
        assert out.startswith("ERROR:")


class TestSetSlideHtml:
    def test_good_html(self, ctx):
        html = '<template><div data-composition-id="__OVK_SLIDE_ID__"><h1>__OVK_TITLE__</h1></div></template>'
        out = _tool(ctx, "set_slide_html").invoke({"slide_id": "slide-0", "html": html})
        op = is_ops_result(out)["_ovk_ops"][0]
        assert op["kind"] == "setSlideHtml"
        assert op["slideId"] == "slide-0"

    def test_wrapper_rejected(self, ctx):
        out = _tool(ctx, "set_slide_html").invoke(
            {"slide_id": "slide-0", "html": "<html><template></template></html>"}
        )
        assert out.startswith("ERROR:")
        assert "R2" in out


class TestSetCaptionStyle:
    def test_known_style(self, ctx):
        out = _tool(ctx, "set_caption_style").invoke({"style": "neon"})
        op = is_ops_result(out)["_ovk_ops"][0]
        assert op == {"kind": "setCaptionStyle", "style": "neon"}

    def test_unknown_style_rejected(self, ctx):
        out = _tool(ctx, "set_caption_style").invoke({"style": "flashy"})
        assert out.startswith("ERROR:")


class TestSetCaptionSettings:
    def test_allowed_keys(self, ctx):
        out = _tool(ctx, "set_caption_settings").invoke(
            {"settings": {"activeColor": "#ffea00", "glow": 2}}
        )
        op = is_ops_result(out)["_ovk_ops"][0]
        assert op["kind"] == "setCaptionSettings"
        assert op["settings"]["glow"] == 2

    def test_unknown_key_rejected(self, ctx):
        out = _tool(ctx, "set_caption_settings").invoke(
            {"settings": {"fontSize": 99}}
        )
        assert out.startswith("ERROR:")

    def test_empty_rejected(self, ctx):
        out = _tool(ctx, "set_caption_settings").invoke({"settings": {}})
        assert out.startswith("ERROR:")
