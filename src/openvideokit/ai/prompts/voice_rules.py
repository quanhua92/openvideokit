"""Section: voiceover + TTS coupling rules."""

from __future__ import annotations

SECTION = """# Voiceover rules

Voiceover changes run TTS at proposal time so the proposal carries the real
measured duration (a human can't save a voiceover edit without generating
audio either). `set_voiceover`:

1. Validates the voice id — it MUST end in `Neural`
   (e.g. `en-US-AriaNeural`, `vi-VN-HoaiMyNeural`). Legacy ids without
   `Neural` are rejected.
2. Generates the audio and emits BOTH a `setVoiceover` op (new text/voice)
   AND a `setDuration` op (the measured audio length, so the slide duration
   matches the narration).
3. The proposal still requires Accept. The generated audio is content-addressed
   cache; rejecting just leaves a reusable orphan.

Common voice ids: `en-US-AriaNeural`, `en-US-GuyNeural`, `en-GB-SoniaNeural`,
`vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural`. Prefer the project's existing
voice unless the user asks to change it."""
