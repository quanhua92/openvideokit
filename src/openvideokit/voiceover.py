"""edge-tts pipeline with content-addressed cache.

For each slide:
  1. Hash ``text + voice + rate + pitch + volume`` → cache key.
  2. If ``audio.json`` sidecar exists with matching ``textHash`` →
     read duration from json (instant, skip TTS).
  3. Otherwise: edge-tts → mp3 → ffprobe → save both + json sidecar.

Audio + metadata live inside the slide's own folder::

    slides/{slide_id}/
    ├── index.json
    ├── index.html
    ├── audio.mp3     ← edge-tts output
    └── audio.json    ← {textHash, duration, voice, rate, ...}
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import logging
import subprocess
import threading
from pathlib import Path

from .store import _slide_dir

_logger = logging.getLogger(__name__)


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


def _try_cache(slide_dir: Path, text_hash: str) -> dict | None:
    """Return full companion metadata if audio-{hash}.json + .mp3 both exist."""
    companion = slide_dir / f"audio-{text_hash}.json"
    mp3 = slide_dir / f"audio-{text_hash}.mp3"
    if not companion.is_file() or not mp3.is_file():
        return None
    try:
        return json.loads(companion.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _save_meta(
    slide_dir: Path,
    text_hash: str,
    text: str,
    voice: str,
    duration: float,
    rate: str = "",
    pitch: str = "",
    volume: str = "",
) -> None:
    # Read existing audio.json to preserve history
    existing: dict = {}
    meta = slide_dir / "audio.json"
    if meta.is_file():
        with contextlib.suppress(json.JSONDecodeError, OSError):
            existing = json.loads(meta.read_text(encoding="utf-8"))

    # Move old hash into history
    old_hash = existing.get("textHash")
    history: list[str] = existing.get("history", [])
    if old_hash and old_hash != text_hash and old_hash not in history:
        history.insert(0, old_hash)

    # Keep only last 2 — delete older audio files
    while len(history) > 2:
        stale = history.pop()
        (slide_dir / f"audio-{stale}.mp3").unlink(missing_ok=True)
        (slide_dir / f"audio-{stale}.json").unlink(missing_ok=True)

    data = json.dumps(
        {
            "textHash": text_hash,
            "text": text,
            "voice": voice,
            "rate": rate,
            "pitch": pitch,
            "volume": volume,
            "duration": round(duration, 3),
            "history": history,
        },
        ensure_ascii=False,
        indent=2,
    )
    # Companion: per-variant metadata
    (slide_dir / f"audio-{text_hash}.json").write_text(data, encoding="utf-8")
    # Pointer: latest/current variant
    (slide_dir / "audio.json").write_text(data, encoding="utf-8")


def _touch_latest(slide_dir: Path, text_hash: str) -> None:
    """Update audio.json's textHash to point to the current variant."""
    from .store import _atomic_write

    meta = slide_dir / "audio.json"
    companion = slide_dir / f"audio-{text_hash}.json"
    if companion.is_file():
        _atomic_write(meta, companion.read_text(encoding="utf-8"))


def generate_audio(project_id: str, slides: list[dict]) -> list[dict]:
    """TTS each slide → save mp3 + json into the slide folder → return durations."""
    timings: list[dict] = []

    for slide in slides:
        sid = slide["id"]
        text = slide.get("text", "").strip()
        voice = slide.get("voice", "en-US-AriaNeural")
        rate = slide.get("rate", "")
        pitch = slide.get("pitch", "")
        volume = slide.get("volume", "")

        if not text:
            timings.append({"slideId": sid, "duration": 0.0, "audio": "", "audioHash": ""})
            continue

        sdir = _slide_dir(project_id, sid)
        sdir.mkdir(parents=True, exist_ok=True)
        thash = _text_hash(text, voice, rate, pitch, volume)

        cached = _try_cache(sdir, thash)
        audio_url = f"/api/projects/{project_id}/slides/{sid}/audio/{thash}"
        if cached is not None:
            _logger.debug(
                "TTS cache hit: %s/%s hash=%s companion=%s",
                project_id,
                sid,
                thash,
                cached,
            )
            # Update the latest pointer so GET /audio serves the right variant
            _touch_latest(sdir, thash)
            timings.append(
                {
                    "slideId": sid,
                    "duration": cached["duration"],
                    "audio": audio_url,
                    "audioHash": thash,
                }
            )
            continue

        _logger.info(
            "TTS generating: %s/%s hash=%s voice=%s text=%r",
            project_id,
            sid,
            thash,
            voice,
            text[:80],
        )
        mp3_path = sdir / f"audio-{thash}.mp3"
        try:
            _tts_sentence(text, voice, mp3_path, rate=rate, pitch=pitch, volume=volume)
            dur = _probe_duration(mp3_path)
        except Exception:
            timings.append({"slideId": sid, "duration": 0.0, "audio": "", "audioHash": ""})
            continue
        _save_meta(sdir, thash, text, voice, dur, rate, pitch, volume)
        _logger.info(
            "TTS done: %s/%s hash=%s dur=%.3fs text=%r",
            project_id,
            sid,
            thash,
            dur,
            text[:80],
        )
        timings.append(
            {"slideId": sid, "duration": round(dur, 3), "audio": audio_url, "audioHash": thash}
        )

    return timings
