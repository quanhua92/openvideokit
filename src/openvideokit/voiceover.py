"""edge-tts pipeline: generate per-slide mp3s + measure durations.

For each slide:
  1. edge-tts synthesises an mp3 → ``data/{project_id}/audio/{slide_id}.mp3``
  2. ffprobe measures the real duration
  3. Returns ``{slideId, duration, audio}`` where ``audio`` is the playback URL

Full concat / export pipeline is deferred — this module generates per-slide
audio + durations only.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import threading
from pathlib import Path

from .config import DATA_DIR


def _audio_dir(project_id: str) -> Path:
    d = Path(DATA_DIR) / project_id / "audio"
    d.mkdir(parents=True, exist_ok=True)
    return d


async def _tts_async(text: str, voice: str, output: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output))


def _tts_sentence(text: str, voice: str, output: Path) -> None:
    """Sync wrapper — runs edge-tts in a dedicated thread.

    ``asyncio.run()`` cannot be called from the FastAPI event loop directly;
    spawning a thread is the proven pattern (see AGENTS.md pitfall #2).
    """

    def _worker() -> None:
        asyncio.run(_tts_async(text, voice, output))

    t = threading.Thread(target=_worker)
    t.start()
    t.join()


def _probe_duration(path: Path) -> float:
    """Measure audio duration via ffprobe."""
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


def generate_audio(
    project_id: str,
    slides: list[dict],
) -> list[dict]:
    """TTS each slide → save mp3 → measure duration.

    Args:
        project_id: Project identifier (for the audio file path).
        slides: ``[{"id": "slide-0", "text": "...", "voice": "en-US-AriaNeural"}, ...]``

    Returns:
        ``[{"slideId": "slide-0", "duration": 3.5, "audio": "/api/projects/.../audio/slide-0"}, ...]``
    """
    audio_dir = _audio_dir(project_id)
    timings: list[dict] = []

    for slide in slides:
        sid = slide["id"]
        text = slide.get("text", "").strip()
        if not text:
            timings.append({"slideId": sid, "duration": 0.0, "audio": ""})
            continue

        voice = slide.get("voice", "en-US-AriaNeural")
        mp3_path = audio_dir / f"{sid}.mp3"
        _tts_sentence(text, voice, mp3_path)
        dur = _probe_duration(mp3_path)
        timings.append(
            {
                "slideId": sid,
                "duration": round(dur, 3),
                "audio": f"/api/projects/{project_id}/audio/{sid}",
            }
        )

    return timings
