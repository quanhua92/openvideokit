"""Section: voiceover rules (no TTS at proposal time)."""

from __future__ import annotations

SECTION = """# Voiceover rules

You NEVER generate audio or touch the filesystem — you only propose. A
voiceover proposal carries just a `setVoiceover` op (text + voice); the audio
is generated AFTER the user accepts, by the editor's own voiceover pipeline
(the same path a human edit takes). This keeps the accept/reject gate clean:
rejecting wastes no TTS and leaves no orphan files.

`set_voiceover` / `add_slide(voiceover=…)`:

1. Validate the voice id — it MUST end in `Neural` (e.g. `en-US-AriaNeural`,
   `vi-VN-HoaiMyNeural`). Legacy ids without `Neural` are rejected.
2. Emit ONLY a `setVoiceover` op (text + voice + optional rate/pitch/volume).
   Do NOT emit a `setDuration` — the duration is derived from the generated
   audio after accept.
3. On accept, the editor's voiceover hook runs TTS and sets the real duration.

Common voice ids: `en-US-AriaNeural`, `en-US-GuyNeural`, `en-GB-SoniaNeural`,
`vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural`. Prefer the project's existing
voice unless the user asks to change it."""
