"""Voiceover generation: TTS per sentence, silence padding, ffmpeg concat.

Pipeline (per your workflow spec):
  1. Split script into sentences (TEXT_PARTS) with target start times (TARGET_STARTS).
  2. TTS each sentence via edge-tts → temp_sentence_i.mp3.
  3. Probe actual duration with ffprobe.
  4. If gap = target_start - current_time > 0, generate silence via ffmpeg anullsrc.
  5. Concat all segments → assets/voiceover.mp3.
  6. Write per-sentence timings → assets/voiceover_timings.json.

Used by:
  - scripts/generate_voiceover.py  (standalone CLI)
  - templating.stamp_session()     (when a "voiceover" slot type is present)
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class SentenceTiming:
    index: int
    text: str
    start: float
    end: float
    duration: float
    words: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "text": self.text,
            "start": round(self.start, 3),
            "end": round(self.end, 3),
            "duration": round(self.duration, 3),
            "words": self.words,
        }


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def make_silence(duration: float, output: Path, sample_rate: int = 24000) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=channel_layout=mono:sample_rate={sample_rate}",
            "-t",
            f"{duration:.3f}",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "9",
            str(output),
        ],
        capture_output=True,
        check=True,
    )


async def _tts_sentence(text: str, voice: str, output: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output))


def tts_sentence_sync(text: str, voice: str, output: Path) -> None:
    """Sync wrapper — runs in a dedicated thread to work inside async event loops."""

    def _worker() -> None:
        asyncio.run(_tts_sentence(text, voice, output))

    t = threading.Thread(target=_worker)
    t.start()
    t.join()


def generate_voiceover(
    text_parts: list[str],
    target_starts: list[float],
    output_dir: Path,
    voice: str = "vi-VN-HoaiMyNeural",
    gap_threshold: float = 0.05,
) -> dict:
    """Generate voiceover.mp3 + voiceover_timings.json.

    Args:
        text_parts: Script sentences (Vietnamese or any edge-tts supported language).
        target_starts: Desired start time (seconds) for each sentence.
        output_dir: Directory to write voiceover.mp3 and voiceover_timings.json.
        voice: edge-tts voice ID (e.g. vi-VN-HoaiMy, en-US-AriaNeural).
        gap_threshold: Minimum gap (seconds) to insert silence.

    Returns:
        Timings dict with "voice" and "sentences" keys.
    """
    if len(text_parts) != len(target_starts):
        raise ValueError(
            f"text_parts ({len(text_parts)}) and target_starts ({len(target_starts)}) "
            "must have the same length"
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    timings: list[SentenceTiming] = []
    concat_files: list[str] = []
    current_time = 0.0

    with tempfile.TemporaryDirectory() as tmpdir_s:
        tmpdir = Path(tmpdir_s)

        for i, (text, target_start) in enumerate(zip(text_parts, target_starts, strict=True)):
            speech_file = tmpdir / f"sentence_{i:02d}.mp3"
            tts_sentence_sync(text, voice, speech_file)
            speech_dur = probe_duration(speech_file)

            gap = target_start - current_time
            if gap > gap_threshold:
                silence_file = tmpdir / f"silence_{i:02d}.mp3"
                make_silence(gap, silence_file)
                concat_files.append(str(silence_file))
                current_time += gap

            timing = SentenceTiming(
                index=i,
                text=text,
                start=current_time,
                end=current_time + speech_dur,
                duration=speech_dur,
            )
            timings.append(timing)
            concat_files.append(str(speech_file))
            current_time += speech_dur

        concat_list_file = tmpdir / "concat_list.txt"
        concat_list_file.write_text(
            "\n".join(f"file '{f}'" for f in concat_files), encoding="utf-8"
        )

        voiceover_path = output_dir / "voiceover.mp3"
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list_file),
                "-c:a",
                "libmp3lame",
                "-ar",
                "24000",
                "-b:a",
                "64k",
                str(voiceover_path),
            ],
            capture_output=True,
            check=True,
        )

    timings_data = {
        "voice": voice,
        "total_duration": round(current_time, 3),
        "sentences": [t.to_dict() for t in timings],
    }
    timings_path = output_dir / "voiceover_timings.json"
    timings_path.write_text(
        json.dumps(timings_data, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    return timings_data


def generate_voiceover_smart(
    text_parts: list[str],
    output_dir: Path,
    voice: str = "vi-VN-HoaiMyNeural",
    start_offset: float = 0.5,
    gap_between_slides: float = 0.8,
) -> dict:
    """Generate voiceover with SMART auto-timing.

    Instead of requiring manual target_starts, this:
      1. TTS each sentence first
      2. Measures actual duration via ffprobe
      3. Auto-calculates start times: slide N starts right after slide N-1 ends + gap

    Args:
        text_parts: Script sentences (one per slide).
        output_dir: Where to write voiceover.mp3 + voiceover_timings.json.
        voice: edge-tts voice ID.
        start_offset: First slide starts at this time (seconds).
        gap_between_slides: Pause between slides (seconds).

    Returns:
        Timings dict (same format as generate_voiceover).
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    timings: list[SentenceTiming] = []
    concat_files: list[str] = []

    with tempfile.TemporaryDirectory() as tmpdir_s:
        tmpdir = Path(tmpdir_s)

        # Phase 1: TTS all sentences, measure durations
        durations: list[float] = []
        speech_files: list[Path] = []
        for i, text in enumerate(text_parts):
            speech_file = tmpdir / f"sentence_{i:02d}.mp3"
            tts_sentence_sync(text, voice, speech_file)
            dur = probe_duration(speech_file)
            durations.append(dur)
            speech_files.append(speech_file)

        # Phase 2: Compute smart target_starts from measured durations
        target_starts: list[float] = []
        cursor = start_offset
        for i, dur in enumerate(durations):
            target_starts.append(cursor)
            cursor += dur
            if i < len(durations) - 1:
                cursor += gap_between_slides

        # Phase 3: Build concat list with silence padding
        current_time = 0.0
        for i, (text, target_start) in enumerate(
            zip(text_parts, target_starts, strict=True)
        ):
            gap = target_start - current_time
            if gap > 0.05:
                silence_file = tmpdir / f"silence_{i:02d}.mp3"
                make_silence(gap, silence_file)
                concat_files.append(str(silence_file))
                current_time += gap

            timing = SentenceTiming(
                index=i,
                text=text,
                start=current_time,
                end=current_time + durations[i],
                duration=durations[i],
            )
            timings.append(timing)
            concat_files.append(str(speech_files[i]))
            current_time += durations[i]

        # Phase 4: Concat
        concat_list_file = tmpdir / "concat_list.txt"
        concat_list_file.write_text(
            "\n".join(f"file '{f}'" for f in concat_files), encoding="utf-8"
        )

        voiceover_path = output_dir / "voiceover.mp3"
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list_file),
                "-c:a",
                "libmp3lame",
                "-ar",
                "24000",
                "-b:a",
                "64k",
                str(voiceover_path),
            ],
            capture_output=True,
            check=True,
        )

    timings_data = {
        "voice": voice,
        "total_duration": round(current_time, 3),
        "start_offset": start_offset,
        "gap_between_slides": gap_between_slides,
        "sentences": [t.to_dict() for t in timings],
    }
    timings_path = output_dir / "voiceover_timings.json"
    timings_path.write_text(
        json.dumps(timings_data, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    return timings_data
