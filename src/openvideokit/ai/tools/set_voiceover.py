"""set_voiceover — propose setVoiceover + setDuration, running TTS first.

Per docs/ai.md §6: the proposal carries the *measured* audio duration, because
a human can't save a voiceover edit without generating either. The generated
audio is content-addressed cache (rev-neutral) — rejecting the proposal leaves
a reusable orphan, not a corrupted project.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..ops import set_duration, set_voiceover
from ._registry import ops_result
from ._voicelist import is_valid_voice

if TYPE_CHECKING:
    pass

_DESCRIPTION = (
    "Change a slide's voiceover (narration). Runs TTS at proposal time so the "
    "duration matches the real audio. The voice id MUST end in 'Neural' "
    "(e.g. en-US-AriaNeural, vi-VN-HoaiMyNeural). Emits setVoiceover + "
    "setDuration; the user must accept."
)


class _Args(BaseModel):
    slide_id: str = Field(description="Target slide id.")
    text: str = Field(description="The new narration text.")
    voice: str | None = Field(
        default=None,
        description="Voice id ending in 'Neural'. Omit to keep the slide's current voice.",
    )
    rate: str | None = Field(default=None, description="Optional rate e.g. '+10%'.")
    pitch: str | None = Field(default=None, description="Optional pitch e.g. '+2Hz'.")
    volume: str | None = Field(default=None, description="Optional volume e.g. '-20%'.")


def build(ctx):
    def run(
        slide_id: str,
        text: str,
        voice: str | None = None,
        rate: str | None = None,
        pitch: str | None = None,
        volume: str | None = None,
    ) -> str:
        if not ctx.slide_exists(slide_id):
            return f"ERROR: unknown slide '{slide_id}'. Known: {ctx.slide_ids}"
        text = (text or "").strip()
        if not text:
            return "ERROR: voiceover text is required"

        # Resolve the effective voice (fall back to the slide's current one).
        current = ctx.slides.get(slide_id, {}).get("voiceover") or {}
        eff_voice = voice or current.get("voice") or "en-US-AriaNeural"
        if not is_valid_voice(eff_voice):
            return (
                f"ERROR: voice '{eff_voice}' is invalid — must end in 'Neural' "
                f"(e.g. en-US-AriaNeural)."
            )

        # Run TTS to measure the real duration. Lazy import to keep the module
        # importable without the TTS deps loaded.
        from ...voiceover import generate_audio

        payload = [{"id": slide_id, "text": text, "voice": eff_voice}]
        for k, v in (("rate", rate), ("pitch", pitch), ("volume", volume)):
            if v:
                payload[0][k] = v
        timings = generate_audio(ctx.project_id, payload)
        measured = 0.0
        if timings:
            measured = float(timings[0].get("duration") or 0.0)

        ops = [
            set_voiceover(
                slide_id,
                text=text,
                voice=eff_voice,
                rate=rate,
                pitch=pitch,
                volume=volume,
            ),
            set_duration(slide_id, round(measured, 3) if measured > 0 else 5.0),
        ]
        return ops_result(
            ops,
            rationale=f"Updated narration on {slide_id} (TTS measured {measured:.2f}s).",
            slide_id=slide_id,
        )

    return StructuredTool.from_function(run, name="set_voiceover", description=_DESCRIPTION, args_schema=_Args)
