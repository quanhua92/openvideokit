"""Tests for ai/prompts/ — section rendering + assembly."""

from __future__ import annotations

from openvideokit.ai.prompts import SECTION_ORDER, build_system_prompt


class TestBuildSystemPrompt:
    def test_contains_all_section_markers(self, ctx):
        prompt = build_system_prompt(ctx)
        # Each section's H1 heading should appear
        assert "# Role" in prompt
        assert "# Project document model" in prompt
        assert "# Tools" in prompt
        assert "# Caption rules (CRITICAL)" in prompt
        assert "# Slide HTML contract" in prompt
        assert "# Voiceover rules" in prompt
        assert "# Safety" in prompt
        assert "# Current project" in prompt

    def test_section_order(self):
        # role → model → tools → caption_rules → html_contract → voice_rules → safety → project_context
        assert SECTION_ORDER[0] == "role"
        assert SECTION_ORDER[-1] == "project_context"
        assert SECTION_ORDER.index("safety") > SECTION_ORDER.index("tools")

    def test_tools_section_auto_generated_from_registry(self, ctx):
        prompt = build_system_prompt(ctx)
        # every real tool name appears in the prompt
        for name in (
            "read_file", "list_slides", "list_files", "grep_slides",
            "set_field", "set_voiceover", "set_duration", "add_slide",
            "remove_slide", "duplicate_slide", "reorder_slides",
            "set_slide_html", "set_caption_style", "set_caption_settings",
        ):
            assert name in prompt, f"tool {name} missing from prompt"

    def test_dynamic_project_context(self, ctx):
        prompt = build_system_prompt(ctx)
        assert "proj-1" in prompt
        assert "slide-0" in prompt
        assert "active slide" in prompt

    def test_nonempty(self, ctx):
        prompt = build_system_prompt(ctx)
        assert len(prompt) > 500
