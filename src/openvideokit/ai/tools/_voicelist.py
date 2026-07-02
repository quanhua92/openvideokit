"""Known edge-tts Neural voice ids + validation.

Mirrors the ovk-web zod rule: voice ids MUST end in ``Neural`` (the legacy ids
like ``vi-VN-HoaiMy`` without the suffix are rejected — they 404 on the edge
endpoint).
"""

from __future__ import annotations

# A pragmatic subset; the agent may use others as long as they end in Neural.
KNOWN_VOICES = {
    "en-US-AriaNeural",
    "en-US-GuyNeural",
    "en-US-JennyNeural",
    "en-GB-SoniaNeural",
    "en-GB-RyanNeural",
    "en-AU-NatashaNeural",
    "vi-VN-HoaiMyNeural",
    "vi-VN-NamMinhNeural",
}


def is_valid_voice(voice: str) -> bool:
    """A voice id is valid iff it ends in `Neural` and looks like ``xx-XX-NameNeural``.

    Rejects the bare suffix ``"Neural"`` and legacy ids without it.
    """
    return (
        bool(voice)
        and voice.endswith("Neural")
        and len(voice) > len("Neural")
        and "-" in voice
    )
