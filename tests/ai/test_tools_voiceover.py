"""Tests for set_voiceover — TTS path, with generate_audio monkeypatched.

No real edge-tts/ffprobe runs. We assert the tool:
  - rejects non-Neural voices,
  - runs the (faked) TTS pipeline,
  - emits BOTH setVoiceover + setDuration (duration = measured),
  - the proposal is an ops-result.
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
def fake_generate(monkeypatch):
    """Replace voiceover.generate_audio with a deterministic fake."""
    calls: list[dict] = []

    def _fake(project_id, slides):
        calls.append({"project_id": project_id, "slides": list(slides)})
        return [{"slideId": s["id"], "duration": 2.75, "audio": f"/x/{s['id']}", "audioHash": "deadbeef"} for s in slides]

    monkeypatch.setattr(voiceover, "generate_audio", _fake)
    return calls


class TestSetVoiceover:
    def test_emits_voiceover_and_duration(self, ctx, fake_generate):
        out = _tool(ctx).invoke(
            {"slide_id": "slide-0", "text": "New narration.", "voice": "en-US-AriaNeural"}
        )
        decoded = is_ops_result(out)
        assert decoded is not None
        kinds = [o["kind"] for o in decoded["_ovk_ops"]]
        assert "setVoiceover" in kinds and "setDuration" in kinds
        vo = [o for o in decoded["_ovk_ops"] if o["kind"] == "setVoiceover"][0]
        assert vo["text"] == "New narration."
        assert vo["voice"] == "en-US-AriaNeural"
        dur = [o for o in decoded["_ovk_ops"] if o["kind"] == "setDuration"][0]
        assert dur["duration"] == 2.75  # measured from fake TTS

    def test_runs_tts(self, ctx, fake_generate):
        _tool(ctx).invoke(
            {"slide_id": "slide-0", "text": "hi", "voice": "vi-VN-HoaiMyNeural"}
        )
        assert len(fake_generate) == 1
        assert fake_generate[0]["slides"][0]["text"] == "hi"
        assert fake_generate[0]["slides"][0]["voice"] == "vi-VN-HoaiMyNeural"

    def test_neural_required(self, ctx, fake_generate):
        out = _tool(ctx).invoke(
            {"slide_id": "slide-0", "text": "hi", "voice": "vi-VN-HoaiMy"}  # legacy
        )
        assert out.startswith("ERROR:")
        assert "Neural" in out
        assert fake_generate == []  # TTS never ran

    def test_empty_text_rejected(self, ctx, fake_generate):
        out = _tool(ctx).invoke({"slide_id": "slide-0", "text": "   "})
        assert out.startswith("ERROR:")
        assert fake_generate == []

    def test_unknown_slide(self, ctx, fake_generate):
        out = _tool(ctx).invoke({"slide_id": "nope", "text": "hi"})
        assert out.startswith("ERROR:")
        assert fake_generate == []

    def test_voice_falls_back_to_current(self, ctx, fake_generate):
        # slide-0 already has voice en-US-AriaNeural; omit voice arg
        _tool(ctx).invoke({"slide_id": "slide-0", "text": "hi"})
        assert fake_generate[0]["slides"][0]["voice"] == "en-US-AriaNeural"

    def test_optional_params_forwarded(self, ctx, fake_generate):
        out = _tool(ctx).invoke(
            {
                "slide_id": "slide-0",
                "text": "hi",
                "rate": "+10%",
                "pitch": "+2Hz",
                "volume": "-20%",
            }
        )
        # Forwarded to the TTS payload...
        payload = fake_generate[0]["slides"][0]
        assert payload["rate"] == "+10%"
        assert payload["pitch"] == "+2Hz"
        assert payload["volume"] == "-20%"
        # ...and into the emitted setVoiceover op.
        vo = [
            o for o in is_ops_result(out)["_ovk_ops"] if o["kind"] == "setVoiceover"
        ][0]
        assert vo["rate"] == "+10%"
        assert vo["pitch"] == "+2Hz"
        assert vo["volume"] == "-20%"
