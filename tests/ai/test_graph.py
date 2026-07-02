"""Tests for graph.py — agent construction + tool binding."""

from __future__ import annotations

import json

from openvideokit.ai.graph import build_agent
from openvideokit.ai.tools import build_tools


class TestBuildTools:
    def test_returns_15_tools(self, ctx):
        tools = build_tools(ctx)
        assert len(tools) == 15

    def test_tool_names(self, ctx):
        names = {t.name for t in build_tools(ctx)}
        expected = {
            "read_file", "read_many_files", "list_slides", "list_files", "grep_slides",
            "set_field", "set_voiceover", "set_duration", "add_slide",
            "remove_slide", "duplicate_slide", "reorder_slides",
            "set_slide_html", "set_caption_style", "set_caption_settings",
        }
        assert names == expected

    def test_ctx_is_bound(self, ctx):
        # Each tool should close over ctx — invoking with valid args should work
        t = next(t for t in build_tools(ctx) if t.name == "list_slides")
        rows = json.loads(t.invoke({}))
        assert any(r["id"] == "slide-0" for r in rows)


class TestBuildAgent:
    def test_constructs_with_fake_model(self, ctx, make_fake_model):
        from langchain_core.messages import AIMessage

        model = make_fake_model(scripted=[AIMessage(content="Hello.")])
        agent = build_agent(model, ctx)
        assert agent is not None  # compiled graph
