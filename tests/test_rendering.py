"""Unit tests for rendering.py — export job lifecycle, audio injection, helpers."""

from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

import pytest

from openvideokit import rendering
from openvideokit.seed import fixture_project

# ── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _executor():
    """Init a tiny executor for each test, shut it down after."""
    rendering.init_executor(1)
    yield
    rendering.shutdown_executor()


@pytest.fixture(autouse=True)
def _clean_jobs():
    """Wipe JOBS between tests."""
    rendering._JOBS.clear()


@pytest.fixture(autouse=True)
def _isolated_data_dir(tmp_path, monkeypatch):
    """Redirect store._DATA_PATH so tests never read real audio files."""
    monkeypatch.setattr("openvideokit.store._DATA_PATH", tmp_path / "data")


@pytest.fixture
def tmp_jobs_dir(tmp_path, monkeypatch):
    """Redirect JOBS_DIR to tmp_path."""
    monkeypatch.setattr("openvideokit.config.JOBS_DIR", str(tmp_path / "jobs"))
    return tmp_path / "jobs"


# ── _total_duration ──────────────────────────────────────────────────────


class TestTotalDuration:
    def test_fixture_total(self):
        project = fixture_project()
        total = rendering._total_duration(project)
        # 3 slides × 5.0s = 15.0s
        assert total == 15.0

    def test_custom_durations(self):
        project = fixture_project()
        project["slides"]["slide-0"]["duration"] = 3.0
        project["slides"]["slide-1"]["duration"] = 7.5
        project["slides"]["slide-2"]["duration"] = 2.0
        assert rendering._total_duration(project) == 12.5

    def test_missing_slide(self):
        project = fixture_project()
        project["root"]["slides"] = ["slide-0", "ghost"]
        # ghost not in slides → defaults to 5.0
        total = rendering._total_duration(project)
        assert total == 10.0  # 5.0 + 5.0(default)


# ── _inject_voiceover_audio ─────────────────────────────────────────────


class TestInjectVoiceoverAudio:
    def test_injects_audio_tag(self):
        html = "<html><body></body></html>"
        result = rendering._inject_voiceover_audio(html, 15.0)
        assert "<audio" in result
        assert 'src="voiceover.mp3"' in result
        assert 'data-start="0"' in result
        assert 'data-duration="15.0"' in result

    def test_preserves_body_content(self):
        html = "<html><body><div>content</div></body></html>"
        result = rendering._inject_voiceover_audio(html, 10.0)
        assert "<div>content</div>" in result
        assert result.count("</body>") == 1

    def test_no_js_imperative_control(self):
        """HF lint bans imperative play()/pause()/currentTime in <script>."""
        html = "<html><body></body></html>"
        result = rendering._inject_voiceover_audio(html, 5.0)
        assert "vo.play()" not in result
        assert "vo.pause()" not in result
        assert "vo.currentTime" not in result


# ── _public ──────────────────────────────────────────────────────────────


class TestPublic:
    def test_strips_internal_keys(self):
        job = {
            "id": "abc",
            "project_id": "p1",
            "status": "running",
            "_proc": "Popen",
            "_cancel_requested": False,
        }
        pub = rendering._public(job)
        assert "_proc" not in pub
        assert "_cancel_requested" not in pub
        assert pub["id"] == "abc"
        assert pub["status"] == "running"


# ── enqueue_render ───────────────────────────────────────────────────────


class TestEnqueueRender:
    def test_creates_job_dir(self, tmp_jobs_dir):
        project = fixture_project()
        job_id = rendering.enqueue_render(project, "proj-1")
        assert len(job_id) == 12

        jdir = Path(rendering._JOBS[job_id]["output"]).parent
        assert jdir.is_dir()
        assert (jdir / "index.html").is_file()

    def test_index_html_is_self_contained(self, tmp_jobs_dir):
        project = fixture_project()
        job_id = rendering.enqueue_render(project, "proj-1")
        jdir = Path(rendering._JOBS[job_id]["output"]).parent
        html = (jdir / "index.html").read_text()
        assert "window.__timelines" in html
        assert "data-composition-id" in html
        assert "__OVK_" not in html

    def test_no_voiceover_when_no_audio(self, tmp_jobs_dir):
        """Fixture has no audio.json on disk → no voiceover.mp3."""
        project = fixture_project()
        job_id = rendering.enqueue_render(project, "proj-1")
        jdir = Path(rendering._JOBS[job_id]["output"]).parent
        assert not (jdir / "voiceover.mp3").exists()
        # HTML should NOT have audio tag
        html = (jdir / "index.html").read_text()
        assert "<audio" not in html

    def test_job_status_queued(self, tmp_jobs_dir):
        project = fixture_project()
        job_id = rendering.enqueue_render(project, "proj-1")
        job = rendering.get_job(job_id)
        assert job is not None
        assert job["status"] in ("queued", "running")
        assert job["project_id"] == "proj-1"

    def test_job_id_is_hex(self, tmp_jobs_dir):
        project = fixture_project()
        job_id = rendering.enqueue_render(project, "proj-1")
        assert all(c in "0123456789abcdef" for c in job_id)


# ── get_job ──────────────────────────────────────────────────────────────


class TestGetJob:
    def test_unknown_returns_none(self, tmp_jobs_dir):
        assert rendering.get_job("nonexistent") is None

    def test_filesystem_fallback_done(self, tmp_jobs_dir):
        """output.mp4 on disk → reconstructed as done."""
        jdir = tmp_jobs_dir / "recon123"
        jdir.mkdir(parents=True)
        (jdir / "output.mp4").write_bytes(b"fake mp4")
        (jdir / "render.log").write_text("log")

        job = rendering.get_job("recon123")
        assert job is not None
        assert job["status"] == "done"
        assert job.get("reconstructed") is True

    def test_filesystem_fallback_failed(self, tmp_jobs_dir):
        """Only log, no mp4 → reconstructed as failed."""
        jdir = tmp_jobs_dir / "failed01"
        jdir.mkdir(parents=True)
        (jdir / "render.log").write_text("error log")

        job = rendering.get_job("failed01")
        assert job is not None
        assert job["status"] == "failed"
        assert job.get("reconstructed") is True


# ── cancel_job ───────────────────────────────────────────────────────────


class TestCancelJob:
    def test_unknown_returns_none(self, tmp_jobs_dir):
        assert rendering.cancel_job("ghost") is None

    def test_cancel_sets_flag(self, tmp_jobs_dir):
        project = fixture_project()
        job_id = rendering.enqueue_render(project, "proj-1")

        rendering.cancel_job(job_id)
        job = rendering._JOBS[job_id]
        assert job["_cancel_requested"] is True

    def test_cancel_terminal_is_noop(self, tmp_jobs_dir):
        """Cancelling an already-done job doesn't error."""
        project = fixture_project()
        job_id = rendering.enqueue_render(project, "proj-1")
        # Manually set to done
        rendering._JOBS[job_id]["status"] = "done"
        rendering._JOBS[job_id]["ended_at"] = time.time()

        result = rendering.cancel_job(job_id)
        assert result is not None
        assert result["status"] == "done"


# ── list_jobs ────────────────────────────────────────────────────────────


class TestListJobs:
    def test_filter_by_project(self, tmp_jobs_dir):
        project = fixture_project()
        id1 = rendering.enqueue_render(project, "proj-1")
        id2 = rendering.enqueue_render(project, "proj-2")

        p1_jobs = rendering.list_jobs("proj-1")
        p1_ids = [j["id"] for j in p1_jobs]
        assert id1 in p1_ids
        assert id2 not in p1_ids

    def test_sorted_descending(self, tmp_jobs_dir):
        project = fixture_project()
        id1 = rendering.enqueue_render(project, "proj-1")
        time.sleep(0.05)
        id2 = rendering.enqueue_render(project, "proj-1")

        jobs = rendering.list_jobs("proj-1")
        assert jobs[0]["id"] == id2
        assert jobs[1]["id"] == id1


# ── _build_voiceover_track (needs ffmpeg) ────────────────────────────────


class TestBuildVoiceoverTrack:
    def test_no_audio_returns_false(self, tmp_jobs_dir, tmp_path):
        """No audio.json on disk → returns False, no output file."""
        project = fixture_project()
        result = rendering._build_voiceover_track(
            project, "proj-1", tmp_path / "voiceover.mp3"
        )
        assert result is False
        assert not (tmp_path / "voiceover.mp3").exists()

    @pytest.mark.skipif(
        shutil.which("ffmpeg") is None, reason="ffmpeg not installed"
    )
    def test_concatenates_audio(self, tmp_jobs_dir, tmp_path, monkeypatch):
        """Slides with audio + silence → single voiceover.mp3."""
        from openvideokit.store import _slide_dir
        from openvideokit.voiceover import _probe_duration

        project = fixture_project()
        project_id = "test-vo"

        # Create a tiny mp3 for slide-0 using ffmpeg
        sdir = _slide_dir(project_id, "slide-0")
        sdir.mkdir(parents=True, exist_ok=True)
        audio_file = sdir / "audio-deadbeef12345678.mp3"
        import subprocess

        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
             "-t", "2", "-c:a", "libmp3lame", "-b:a", "64k", str(audio_file)],
            capture_output=True, check=True,
        )
        (sdir / "audio.json").write_text(json.dumps({
            "textHash": "deadbeef12345678",
            "text": "test",
            "voice": "en-US-AriaNeural",
            "duration": 2.0,
        }))

        # Redirect project_id store path
        monkeypatch.setattr(
            "openvideokit.config.DATA_DIR", str(tmp_path / "data")
        )

        out = tmp_path / "voiceover.mp3"
        result = rendering._build_voiceover_track(project, project_id, out)
        assert result is True
        assert out.is_file()
        # Should be ~15s (3 slides × 5s each, slide-0 has 2s audio padded to 5s)
        dur = _probe_duration(out)
        assert 14.0 < dur < 16.0
