"""edge-tts pipeline with content-addressed cache.

For each slide:
  1. Hash ``text + voice`` → cache key.
  2. If ``{slide_id}.json`` sidecar exists with matching ``textHash`` →
     read duration from json (instant, skip TTS).
  3. Otherwise: edge-tts → mp3 → ffprobe → save both + json sidecar.

Any source that changes the text (frontend edit, background AI agent,
disk swap) produces a different hash → automatic cache miss → regenerate.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import subprocess
import threading
from pathlib import Path

from .config import DATA_DIR


def _audio_dir(project_id: str) -> Path:
    d = Path(DATA_DIR) / project_id / "audio"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _text_hash(text: str, voice: str, rate: str = "", pitch: str = "", volume: str = "") -> str:
    return hashlib.sha256(f"{voice}\n{text}\n{rate}\n{pitch}\n{volume}".encode()).hexdigest()[:16]


async def _tts_async(text: str, voice: str, output: Path, **opts: str) -> None:
    import edge_tts

    kwargs = {k: v for k, v in opts.items() if v}
    communicate = edge_tts.Communicate(text, voice, **kwargs)
    await communicate.save(str(output))


def _tts_sentence(text: str, voice: str, output: Path, **opts: str) -> None:
    def _worker() -> None:
        asyncio.run(_tts_async(text, voice, output, **opts))

    t = threading.Thread(target=_worker)
    t.start()
    t.join()


def _probe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def _try_cache(audio_dir: Path, slide_id: str, text_hash: str) -> float | None:
    """Return cached duration if the sidecar json matches text_hash."""
    meta = audio_dir / f"{slide_id}.json"
    if not meta.is_file():
        return None
    try:
        data = json.loads(meta.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if data.get("textHash") == text_hash:
        return data.get("duration")
    return None


def _save_meta(
    audio_dir: Path,
    slide_id: str,
    text_hash: str,
    text: str,
    voice: str,
    duration: float,
    rate: str = "",
    pitch: str = "",
    volume: str = "",
) -> None:
    meta = audio_dir / f"{slide_id}.json"
    meta.write_text(
        json.dumps(
            {
                "textHash": text_hash,
                "text": text,
                "voice": voice,
                "rate": rate,
                "pitch": pitch,
                "volume": volume,
                "duration": round(duration, 3),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def generate_audio(
    project_id: str,
    slides: list[dict],
) -> list[dict]:
    """TTS each slide → save mp3 + json sidecar → return durations.

    Content-addressed: slides whose ``text+voice`` hash matches the cached
    sidecar are skipped (instant).  Changed slides regenerate.
    """
    audio_dir = _audio_dir(project_id)
    timings: list[dict] = []

    for slide in slides:
        sid = slide["id"]
        text = slide.get("text", "").strip()
        voice = slide.get("voice", "en-US-AriaNeural")
        rate = slide.get("rate", "")
        pitch = slide.get("pitch", "")
        volume = slide.get("volume", "")

        if not text:
            timings.append({"slideId": sid, "duration": 0.0, "audio": ""})
            continue

        thash = _text_hash(text, voice, rate, pitch, volume)
        audio_path = f"/api/projects/{project_id}/audio/{sid}"

        cached = _try_cache(audio_dir, sid, thash)
        if cached is not None:
            timings.append({"slideId": sid, "duration": cached, "audio": audio_path})
            continue

        mp3_path = audio_dir / f"{sid}.mp3"
        _tts_sentence(text, voice, mp3_path, rate=rate, pitch=pitch, volume=volume)
        dur = _probe_duration(mp3_path)
        _save_meta(audio_dir, sid, thash, text, voice, dur, rate, pitch, volume)
        timings.append({"slideId": sid, "duration": round(dur, 3), "audio": audio_path})

    return timings
