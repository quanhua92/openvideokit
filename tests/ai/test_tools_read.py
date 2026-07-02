"""Tests for the read-only filesystem tools."""

from __future__ import annotations

import json

from openvideokit.ai.tools import build_tools


def _tool(ctx, name):
    for t in build_tools(ctx):
        if t.name == name:
            return t
    raise KeyError(name)


class TestReadFile:
    def test_read_index_json(self, ctx_on_disk):
        t = _tool(ctx_on_disk, "read_file")
        out = t.invoke({"path": "slide-0/index.json"})
        data = json.loads(out)
        assert data["id"] == "slide-0"
        assert "fields" in data

    def test_read_project_json(self, ctx_on_disk):
        t = _tool(ctx_on_disk, "read_file")
        out = t.invoke({"path": "project.json"})
        data = json.loads(out)
        assert "slides" in data

    def test_path_escape_rejected(self, ctx_on_disk):
        t = _tool(ctx_on_disk, "read_file")
        out = t.invoke({"path": "../../../etc/passwd"})
        assert out.startswith("ERROR:")

    def test_missing_file(self, ctx_on_disk):
        t = _tool(ctx_on_disk, "read_file")
        out = t.invoke({"path": "slide-0/nope.txt"})
        assert out.startswith("ERROR:")

    def test_read_html(self, ctx_on_disk):
        t = _tool(ctx_on_disk, "read_file")
        out = t.invoke({"path": "slide-0/index.html"})
        assert "<template" in out


class TestListSlides:
    def test_shape(self, ctx):
        t = _tool(ctx, "list_slides")
        rows = json.loads(t.invoke({}))
        assert len(rows) == 3
        r0 = rows[0]
        assert r0["id"] == "slide-0"
        assert "title" in r0["fields"]
        assert r0["has_voiceover"] is True
        assert r0["voice"] == "en-US-AriaNeural"


class TestListFiles:
    def test_root(self, ctx_on_disk):
        t = _tool(ctx_on_disk, "list_files")
        out = t.invoke({})
        assert "project.json" in out
        assert "slides/" in out

    def test_slide_folder(self, ctx_on_disk):
        t = _tool(ctx_on_disk, "list_files")
        out = t.invoke({"slide_id": "slide-0"})
        assert "index.json" in out
        assert "index.html" in out

    def test_escape_rejected(self, ctx_on_disk):
        t = _tool(ctx_on_disk, "list_files")
        out = t.invoke({"slide_id": "../../etc"})
        assert out.startswith("ERROR:")


class TestGrep:
    def test_finds_pattern(self, ctx_on_disk):
        t = _tool(ctx_on_disk, "grep_slides")
        hits = json.loads(t.invoke({"pattern": "Eco Bottle"}))
        assert any(h["file"] == "slide-0/index.json" for h in hits)

    def test_invalid_regex(self, ctx):
        t = _tool(ctx, "grep_slides")
        out = t.invoke({"pattern": "(unclosed"})
        assert out.startswith("ERROR:")

    def test_single_slide_scope(self, ctx_on_disk):
        t = _tool(ctx_on_disk, "grep_slides")
        hits = json.loads(t.invoke({"pattern": "title", "slide_id": "slide-0"}))
        files = {h["file"] for h in hits}
        assert all(f.startswith("slide-0/") for f in files)
