"""Unit tests for store.py — rev computation, disk round-trip, update."""

from __future__ import annotations

import json

import pytest

from openvideokit import store
from openvideokit.seed import fixture_project


@pytest.fixture
def fresh_store(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "_DATA_PATH", tmp_path)
    store._STORE = {}
    store.init_store()
    return tmp_path


class TestComputeRev:
    def test_returns_16_char_hex(self):
        bundle = fixture_project()
        rev = store.compute_rev(bundle)
        assert len(rev) == 16
        assert all(c in "0123456789abcdef" for c in rev)

    def test_different_content_different_rev(self):
        b1 = fixture_project()
        b2 = fixture_project()
        b2["slides"]["slide-0"]["fields"]["title"] = "Changed"
        assert store.compute_rev(b1) != store.compute_rev(b2)

    def test_same_content_same_rev(self):
        b1 = fixture_project()
        b2 = fixture_project()
        assert store.compute_rev(b1) == store.compute_rev(b2)

    def test_rev_excludes_rev_field(self):
        b = fixture_project()
        rev1 = store.compute_rev(b)
        b["rev"] = "fake-rev"
        rev2 = store.compute_rev(b)
        assert rev1 == rev2


class TestDiskRoundTrip:
    def test_seed_writes_per_slide_folders(self, fresh_store):
        pid = "proj-1"
        assert (fresh_store / pid / "project.json").is_file()
        for sid in ["slide-0", "slide-1", "slide-2"]:
            sdir = fresh_store / pid / "slides" / sid
            assert (sdir / "index.json").is_file()
            assert (sdir / "index.html").is_file()

    def test_load_assembles_bundle(self, fresh_store):
        bundle = store.get_project("proj-1")
        assert bundle is not None
        assert "root" in bundle
        assert "slides" in bundle
        assert "slideHtml" in bundle
        assert "rev" in bundle
        assert len(bundle["root"]["slides"]) == 3

    def test_external_edit_detected_on_reload(self, fresh_store):
        pid = "proj-1"
        slide_json = fresh_store / pid / "slides" / "slide-0" / "index.json"
        data = json.loads(slide_json.read_text())
        data["fields"]["title"] = "External Edit"
        slide_json.write_text(json.dumps(data))

        result = store.reload_from_disk(pid)
        assert result is not None
        assert result["slides"]["slide-0"]["fields"]["title"] == "External Edit"


class TestUpdateProject:
    def test_successful_update_changes_rev(self, fresh_store):
        bundle = store.get_project("proj-1")
        old_rev = bundle["rev"]
        bundle["slides"]["slide-0"]["fields"]["title"] = "New Title"
        result = store.update_project("proj-1", bundle, old_rev)
        assert result["rev"] != old_rev

    def test_stale_rev_raises_conflict(self, fresh_store):
        bundle = store.get_project("proj-1")
        bundle["slides"]["slide-0"]["fields"]["title"] = "Edit 1"
        store.update_project("proj-1", bundle, bundle["rev"])

        bundle["slides"]["slide-0"]["fields"]["title"] = "Edit 2"
        with pytest.raises(store.ConflictError):
            store.update_project("proj-1", bundle, bundle["rev"])

    def test_persists_to_disk(self, fresh_store):
        bundle = store.get_project("proj-1")
        bundle["slides"]["slide-0"]["fields"]["title"] = "Disk Persist"
        store.update_project("proj-1", bundle, bundle["rev"])

        slide_json = fresh_store / "proj-1" / "slides" / "slide-0" / "index.json"
        disk_data = json.loads(slide_json.read_text())
        assert disk_data["fields"]["title"] == "Disk Persist"

    def test_missing_keys_raises(self, fresh_store):
        bundle = store.get_project("proj-1")
        with pytest.raises(ValueError):
            store.update_project("proj-1", {"root": bundle["root"]}, bundle["rev"])
