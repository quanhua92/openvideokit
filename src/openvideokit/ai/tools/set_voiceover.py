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

from ..ops import set_voiceover
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


def build_voiceover_ops(
    ctx,
    slide_id: str,
    text: str,
    voice: str | None = None,
    rate: str | None = None,
    pitch: str | None = None,
    volume: str | None = None,
) -> list[dict] | str:
    """Build a setVoiceover op for a proposal — NO TTS, NO filesystem writes.

    Per docs/ai.md the agent is a read-only proposal emitter; it must not touch
    the disk before the user accepts. So this only validates the voice id and
    returns a ``setVoiceover`` op. The actual audio is generated AFTER accept,
    by the frontend's voiceover hook (the same path a human edit takes when it
    notices the voiceover text changed and POSTs /tts). Returns an
    ``"ERROR: ..."`` string on validation failure.
    """
    text = (text or "").strip()
    if not text:
        return "ERROR: voiceover text is required"

    current = ctx.slides.get(slide_id, {}).get("voiceover") or {}
    eff_voice = voice or current.get("voice") or "en-US-AriaNeural"
    if not is_valid_voice(eff_voice):
        return (
            f"ERROR: voice '{eff_voice}' is invalid — must end in 'Neural' "
            f"(e.g. en-US-AriaNeural)."
        )

    return [
        set_voiceover(
            slide_id,
            text=text,
            voice=eff_voice,
            rate=rate,
            pitch=pitch,
            volume=volume,
        )
    ]


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

        result = build_voiceover_ops(ctx, slide_id, text, voice, rate, pitch, volume)
        if isinstance(result, str):
            return result  # ERROR: ...
        return ops_result(
            result,
            rationale=f"Propose narration on {slide_id} (audio generates on accept).",
            slide_id=slide_id,
        )

    return StructuredTool.from_function(run, name="set_voiceover", description=_DESCRIPTION, args_schema=_Args)
