"""Tests for set_voiceover — pure proposal emitter (NO TTS at proposal time).

Per docs/ai.md §6, proposal tools never touch the filesystem. set_voiceover
emits ONLY a setVoiceover op; the audio is generated after accept via the
frontend voiceover hook. These tests assert the tool:
  - rejects non-Neural voices,
  - does NOT call generate_audio,
  - emits a single setVoiceover op (no setDuration),
  - forwards rate/pitch/volume into the op.
"""

from __future__ import annotations

import pytest

from openvideokit import voiceover
from openvideokit.ai.tools import build_tools
from openvideokit.ai.tools._registry import is_ops_result


def _tool(ctx, name="set_voiceover"):
    for t in build_tools(ctx):
        if t.name == name:
            return t
    raise KeyError(name)


@pytest.fixture
def tts_spy(monkeypatch):
    """Fail the test if generate_audio is ever called by a proposal tool."""
    calls: list = []

    def _should_not_run(*a, **kw):
        calls.append(1)
        raise AssertionError("generate_audio must NOT run at proposal time")

    monkeypatch.setattr(voiceover, "generate_audio", _should_not_run)
    return calls


class TestSetVoiceover:
    def test_emits_only_setvoiceover(self, ctx, tts_spy):
        out = _tool(ctx).invoke(
            {"slide_id": "slide-0", "text": "New narration.", "voice": "en-US-AriaNeural"}
        )
        decoded = is_ops_result(out)
        assert decoded is not None
        kinds = [o["kind"] for o in decoded["_ovk_ops"]]
        assert kinds == ["setVoiceover"]  # NO setDuration, NO TTS
        vo = decoded["_ovk_ops"][0]
        assert vo["text"] == "New narration."
        assert vo["voice"] == "en-US-AriaNeural"

    def test_does_not_run_tts(self, ctx, tts_spy):
        _tool(ctx).invoke(
            {"slide_id": "slide-0", "text": "hi", "voice": "vi-VN-HoaiMyNeural"}
        )
        assert tts_spy == []  # generate_audio never called

    def test_neural_required(self, ctx, tts_spy):
        out = _tool(ctx).invoke(
            {"slide_id": "slide-0", "text": "hi", "voice": "vi-VN-HoaiMy"}  # legacy
        )
        assert out.startswith("ERROR:")
        assert "Neural" in out
        assert tts_spy == []

    def test_empty_text_rejected(self, ctx, tts_spy):
        out = _tool(ctx).invoke({"slide_id": "slide-0", "text": "   "})
        assert out.startswith("ERROR:")
        assert tts_spy == []

    def test_unknown_slide(self, ctx, tts_spy):
        out = _tool(ctx).invoke({"slide_id": "nope", "text": "hi"})
        assert out.startswith("ERROR:")
        assert tts_spy == []

    def test_voice_falls_back_to_current(self, ctx, tts_spy):
        # slide-0 already has voice en-US-AriaNeural; omit voice arg
        out = _tool(ctx).invoke({"slide_id": "slide-0", "text": "hi"})
        vo = is_ops_result(out)["_ovk_ops"][0]
        assert vo["voice"] == "en-US-AriaNeural"

    def test_optional_params_forwarded_into_op(self, ctx, tts_spy):
        out = _tool(ctx).invoke(
            {
                "slide_id": "slide-0",
                "text": "hi",
                "rate": "+10%",
                "pitch": "+2Hz",
                "volume": "-20%",
            }
        )
        vo = [
            o for o in is_ops_result(out)["_ovk_ops"] if o["kind"] == "setVoiceover"
        ][0]
        assert vo["rate"] == "+10%"
        assert vo["pitch"] == "+2Hz"
        assert vo["volume"] == "-20%"
        assert tts_spy == []
