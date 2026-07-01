"""Route tests for export endpoints — FastAPI TestClient."""

from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from openvideokit import rendering
from openvideokit.app import create_app


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean_jobs(tmp_path, monkeypatch):
    rendering._JOBS.clear()
    # Redirect DATA_DIR so disk-persisted jobs don't leak between tests
    monkeypatch.setattr("openvideokit.config.DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr("openvideokit.store._DATA_PATH", tmp_path / "data")
    yield
    rendering._JOBS.clear()


# ── POST /export ─────────────────────────────────────────────────────────


class TestStartExport:
    def test_returns_202_with_job_id(self, client):
        resp = client.post("/api/projects/proj-1/export")
        assert resp.status_code == 202
        data = resp.json()
        assert "job_id" in data
        assert len(data["job_id"]) == 12
        assert data["status"] == "queued"

    def test_404_unknown_project(self, client):
        resp = client.post("/api/projects/ghost/export")
        assert resp.status_code == 404


# ── GET /export/jobs/{job_id} ───────────────────────────────────────────


class TestGetExportJob:
    def test_returns_job_dict(self, client):
        # Enqueue first
        enqueue = client.post("/api/projects/proj-1/export").json()
        job_id = enqueue["job_id"]

        resp = client.get(f"/api/projects/proj-1/export/jobs/{job_id}")
        assert resp.status_code == 200
        job = resp.json()
        assert job["id"] == job_id
        assert job["project_id"] == "proj-1"
        assert job["status"] in ("queued", "running")
        assert "_proc" not in job  # internal fields stripped
        assert "_cancel_requested" not in job

    def test_404_unknown_job(self, client):
        resp = client.get("/api/projects/proj-1/export/jobs/nonexistent")
        assert resp.status_code == 404

    def test_404_wrong_project(self, client):
        """Job owned by proj-1 can't be accessed via proj-2."""
        enqueue = client.post("/api/projects/proj-1/export").json()
        job_id = enqueue["job_id"]

        resp = client.get(f"/api/projects/proj-2/export/jobs/{job_id}")
        assert resp.status_code == 404


# ── POST /export/jobs/{job_id}/cancel ──────────────────────────────────


class TestCancelExport:
    def test_cancel_returns_job(self, client):
        enqueue = client.post("/api/projects/proj-1/export").json()
        job_id = enqueue["job_id"]

        resp = client.post(f"/api/projects/proj-1/export/jobs/{job_id}/cancel")
        assert resp.status_code == 200
        # Status should be running (SIGTERM sent) or cancelled (if worker already processed)
        assert resp.json()["status"] in ("running", "cancelled")

    def test_cancel_unknown_404(self, client):
        resp = client.post("/api/projects/proj-1/export/jobs/ghost/cancel")
        assert resp.status_code == 404


# ── GET /export/jobs/{job_id}/download ─────────────────────────────────


class TestDownloadExport:
    def test_404_when_not_done(self, client):
        enqueue = client.post("/api/projects/proj-1/export").json()
        job_id = enqueue["job_id"]

        resp = client.get(f"/api/projects/proj-1/export/jobs/{job_id}/download")
        assert resp.status_code == 404

    def test_404_unknown_job(self, client):
        resp = client.get("/api/projects/proj-1/export/jobs/ghost/download")
        assert resp.status_code == 404

    def test_serves_mp4_when_done(self, client, tmp_path, monkeypatch):
        """Create a fake done job with an output.mp4 on disk."""

        from openvideokit.config import JOBS_DIR

        job_id = "dnltest001"
        jdir = Path(JOBS_DIR) / job_id
        jdir.mkdir(parents=True, exist_ok=True)
        (jdir / "output.mp4").write_bytes(b"fake mp4 content")

        rendering._JOBS[job_id] = {
            "id": job_id,
            "project_id": "proj-1",
            "status": "done",
            "output": str(jdir / "output.mp4"),
            "log": str(jdir / "render.log"),
            "started_at": time.time(),
            "ended_at": time.time(),
            "exit_code": 0,
            "error": None,
        }

        resp = client.get(f"/api/projects/proj-1/export/jobs/{job_id}/download")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "video/mp4"
        assert b"fake mp4 content" in resp.content


# ── GET /export/jobs (list) ─────────────────────────────────────────────


class TestListExportJobs:
    def test_returns_list(self, client):
        client.post("/api/projects/proj-1/export")
        client.post("/api/projects/proj-1/export")

        resp = client.get("/api/projects/proj-1/export/jobs")
        assert resp.status_code == 200
        jobs = resp.json()
        assert len(jobs) >= 2
        assert "id" in jobs[0]
        assert "status" in jobs[0]
        assert "_proc" not in jobs[0]

    def test_empty_when_no_jobs(self, client):
        resp = client.get("/api/projects/proj-1/export/jobs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_404_unknown_project(self, client):
        resp = client.get("/api/projects/ghost/export/jobs")
        assert resp.status_code == 404

    def test_jobs_persist_to_disk(self, client, tmp_path):
        """jobs.json is written so exports survive restart."""
        import json
        from pathlib import Path

        enqueue = client.post("/api/projects/proj-1/export").json()
        job_id = enqueue["job_id"]

        # DATA_DIR is monkeypatched to tmp_path/"data" by the fixture
        from openvideokit.config import DATA_DIR
        jobs_file = Path(DATA_DIR) / "proj-1" / "jobs.json"
        assert jobs_file.is_file()
        disk = json.loads(jobs_file.read_text())
        assert any(j["id"] == job_id for j in disk)


# ── GET /export/jobs/{job_id}/log ───────────────────────────────────────


class TestGetExportLog:
    def test_returns_log_text(self, client):
        enqueue = client.post("/api/projects/proj-1/export").json()
        job_id = enqueue["job_id"]

        resp = client.get(f"/api/projects/proj-1/export/jobs/{job_id}/log")
        assert resp.status_code == 200
        assert "log" in resp.json()

    def test_404_unknown_job(self, client):
        resp = client.get("/api/projects/proj-1/export/jobs/ghost/log")
        assert resp.status_code == 404
