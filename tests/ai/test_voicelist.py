"""Unit tests for _voicelist.py."""

from __future__ import annotations

from openvideokit.ai.tools._voicelist import KNOWN_VOICES, is_valid_voice


class TestIsValidVoice:
    def test_neural_suffix_accepted(self):
        assert is_valid_voice("en-US-AriaNeural")
        assert is_valid_voice("vi-VN-HoaiMyNeural")
        assert is_valid_voice("en-GB-SoniaNeural")

    def test_legacy_without_neural_rejected(self):
        assert not is_valid_voice("vi-VN-HoaiMy")  # the documented pitfall
        assert not is_valid_voice("en-US-Aria")

    def test_empty_rejected(self):
        assert not is_valid_voice("")
        assert not is_valid_voice("Neural")  # suffix alone isn't a voice

    def test_known_subset_members_valid(self):
        for v in KNOWN_VOICES:
            assert is_valid_voice(v), f"{v} should be valid"
