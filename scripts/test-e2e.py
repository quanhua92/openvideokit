#!/usr/bin/env python3
"""End-to-end smoke test for the ovk SSR server.

Exercises the full `/api` surface against a running `ovk serve`:

  1. GET /api/projects              — project list
  2. GET /api/projects/{id}         — bundle shape + rev
  3. GET .../composition            — self-contained root HTML
  4. GET .../compositions/{slideId} — stamped slide sub-comps
  5. PUT with rev                   — optimistic locking + 409
  6. SSE push                       — PUT triggers event stream
  7. Disk file watcher              — external edit → reload
  8. TTS + audio                    — edge-tts generates mp3 (optional)
  9. 404s

Usage:
  uv run --extra dev python scripts/test-e2e.py [base_url] [--no-tts]

Requires `ovk serve` to already be running.
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time

import requests

DEFAULT_BASE = "http://127.0.0.1:8000"


def section(title: str) -> None:
    print(f"\n── {title} ───────────────────────────────────────────")


def fail(label: str, detail: str = "") -> None:
    print(f"  ✗ {label}{(': ' + detail) if detail else ''}")
    sys.exit(1)


def assert_ok(resp: requests.Response, label: str) -> None:
    if resp.status_code >= 400:
        fail(label, f"HTTP {resp.status_code} — {resp.text[:200]}")
    print(f"  ✓ {label}: HTTP {resp.status_code}")


def assert_404(resp: requests.Response, label: str) -> None:
    if resp.status_code != 404:
        fail(label, f"expected 404, got {resp.status_code}")
    print(f"  ✓ {label}: HTTP 404")


def main() -> None:
    parser = argparse.ArgumentParser(description="ovk SSR end-to-end smoke test")
    parser.add_argument(
        "base_url",
        nargs="?",
        default=DEFAULT_BASE,
        help=f"Server base URL (default: {DEFAULT_BASE})",
    )
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    s = requests.Session()
    s.headers["User-Agent"] = "ovk-e2e/1.0"

    # ── 1. Project list ────────────────────────────────────────────────────
    section("GET /api/projects")
    r = s.get(f"{base}/api/projects", timeout=5)
    assert_ok(r, "GET /api/projects")
    projects = r.json()
    if not isinstance(projects, list) or not projects:
        fail("project list", f"expected non-empty list, got {projects!r}")
    for p in projects:
        if "id" not in p or "name" not in p:
            fail("project shape", f"missing id/name in {p!r}")
    pid = projects[0]["id"]
    print(f"  projects: {projects}")
    print(f"  using: {pid}")

    # ── 2. Project bundle ──────────────────────────────────────────────────
    section(f"GET /api/projects/{pid}")
    r = s.get(f"{base}/api/projects/{pid}", timeout=5)
    assert_ok(r, "bundle fetch")
    bundle = r.json()
    for key in ("root", "slides", "slideHtml"):
        if key not in bundle:
            fail("bundle shape", f"missing '{key}'")
    slide_ids: list[str] = bundle["root"].get("slides", [])
    if not slide_ids:
        fail("root.slides", "empty slide list")
    print(f"  slides: {slide_ids}")
    if set(slide_ids) != set(bundle["slides"].keys()):
        fail("slide index", "root.slides ≠ slides keys")
    if set(slide_ids) != set(bundle["slideHtml"].keys()):
        fail("slide html", "root.slides ≠ slideHtml keys")

    # ── 3. Root composition ────────────────────────────────────────────────
    section(f"GET /api/projects/{pid}/composition")
    r = s.get(f"{base}/api/projects/{pid}/composition", timeout=5)
    assert_ok(r, "root composition")
    if "text/html" not in r.headers.get("content-type", ""):
        fail("content-type", r.headers.get("content-type"))
    root_html = r.text
    for needle, why in [
        ("gsap", "GSAP script"),
        ('id="stage"', "#stage host"),
        ("window.__timelines", "timeline registry"),
        ("'root'", "root timeline key"),
    ]:
        if needle not in root_html:
            fail(f"root missing {why!r}", f"looked for {needle!r}")
    # self-contained: NO sub-comp references
    if "data-composition-src" in root_html:
        fail("self-contained", "found data-composition-src (should be inlined)")
    # every slide must be inlined with stamped content
    for sid in slide_ids:
        if f'data-composition-id="{sid}"' not in root_html:
            fail("inlined slide", f"slide {sid} missing from root")
    print(f"  ✓ all {len(slide_ids)} slides inlined, no sub-comp refs")

    # ── 4. Each slide sub-composition ──────────────────────────────────────
    for sid in slide_ids:
        section(f"GET .../compositions/{sid}")
        r = s.get(f"{base}/api/projects/{pid}/composition/compositions/{sid}", timeout=5)
        assert_ok(r, f"slide {sid}")
        if "text/html" not in r.headers.get("content-type", ""):
            fail("content-type", r.headers.get("content-type"))
        body = r.text
        if "<template>" not in body:
            fail("slide shape", "missing bare <template> wrapper")
        # slide id must be stamped into the composition id
        if f'data-composition-id="{sid}"' not in body:
            fail("slide id stamp", f"{sid} not in data-composition-id")
        # the slide's title field must appear verbatim
        title = bundle["slides"][sid].get("fields", {}).get("title", "")
        if title and title not in body:
            fail("title stamp", f"{title!r} not found in body")
        # CRITICAL: no un-stamped __OVK_*__ tokens may leak through
        if "__OVK_" in body:
            import re

            leaked = sorted(set(re.findall(r"__OVK_[A-Z0-9_]+__", body)))
            fail("token leak", f"unstamped tokens: {leaked}")
        print(f"  ✓ {sid}: stamped, title={title!r}, no token leaks")

    # ── 5. PUT with rev (optimistic locking) ──────────────────────────────
    section(f"PUT /api/projects/{pid}")
    if "rev" not in bundle:
        fail("bundle shape", "missing rev")
    original_rev = bundle["rev"]
    print(f"  original rev: {original_rev}")

    bundle["slides"][slide_ids[0]]["fields"]["title"] = "E2E Edited Title"
    r = s.put(f"{base}/api/projects/{pid}", json=bundle, timeout=5)
    assert_ok(r, "PUT with correct rev")
    updated = r.json()
    if updated["rev"] == original_rev:
        fail("rev check", "rev didn't change after PUT")
    if "E2E Edited Title" not in str(updated["slides"]):
        fail("edit check", "edit not persisted in response")
    print(f"  ✓ new rev: {updated['rev']}")

    # Stale rev → 409
    r = s.put(f"{base}/api/projects/{pid}", json=bundle, timeout=5)
    if r.status_code != 409:
        fail("stale rev", f"expected 409, got {r.status_code}")
    print(f"  ✓ stale rev rejected: HTTP {r.status_code}")

    # Verify the composition reflects the edit
    r = s.get(f"{base}/api/projects/{pid}/composition", timeout=5)
    assert_ok(r, "re-fetch composition")
    if "E2E Edited Title" not in r.text:
        fail("composition check", "edit not reflected in composition")
    print("  ✓ composition reflects the edit")

    # ── 6. SSE push on PUT ─────────────────────────────────────────────────
    section("SSE /events")
    sse_events: list[str] = []

    def listen_sse() -> None:
        try:
            for line in s.get(
                f"{base}/api/projects/{pid}/events", stream=True, timeout=8
            ).iter_lines():
                if line:
                    sse_events.append(line.decode())
                if len(sse_events) >= 2:
                    break
        except Exception:
            pass

    t = threading.Thread(target=listen_sse, daemon=True)
    t.start()
    time.sleep(1)

    fresh = s.get(f"{base}/api/projects/{pid}, timeout=5").json()
    fresh["slides"][slide_ids[0]]["fields"]["body"] = "SSE push test"
    s.put(f"{base}/api/projects/{pid}", json=fresh, timeout=5)
    t.join(timeout=5)

    if len(sse_events) < 2:
        fail("SSE", f"expected ≥2 events, got {len(sse_events)}")
    if b"rev" not in sse_events[-1].encode():
        fail("SSE payload", f"no rev in last event: {sse_events[-1]}")
    print(f"  ✓ SSE pushed {len(sse_events)} events")

    # ── 7. Disk file watcher ──────────────────────────────────────────────
    section("Disk file watcher")
    import os
    from pathlib import Path

    data_dir = os.environ.get("OVK_DATA_DIR", "data")
    slide_json = Path(data_dir) / pid / "slides" / slide_ids[1] / "index.json"
    if not slide_json.is_file():
        print(f"  · skipped (no disk file at {slide_json})")
    else:
        disk_data = json.loads(slide_json.read_text())
        disk_data["fields"]["title"] = "DISK WATCHER TEST"
        slide_json.write_text(json.dumps(disk_data, indent=2))
        time.sleep(1.5)

        r = s.get(f"{base}/api/projects/{pid}", timeout=5)
        refetch = r.json()
        title = refetch["slides"][slide_ids[1]]["fields"]["title"]
        if title != "DISK WATCHER TEST":
            fail("watcher", f"expected 'DISK WATCHER TEST', got '{title}'")
        print("  ✓ file watcher reloaded external edit")

    # ── 8. TTS + audio (optional) ──────────────────────────────────────────
    section("POST /tts + audio")
    skip_tts = "--no-tts" in sys.argv
    if skip_tts:
        print("  · skipped (--no-tts)")
    else:
        tts_payload = {
            "slides": [
                {
                    "id": slide_ids[0],
                    "text": "This is a test sentence for TTS.",
                    "voice": "en-US-AriaNeural",
                }
            ]
        }
        r = s.post(f"{base}/api/projects/{pid}/tts", json=tts_payload, timeout=30)
        if r.status_code != 200:
            print(f"  · TTS skipped (HTTP {r.status_code} — edge-tts/ffprobe may be missing)")
        else:
            timings = r.json().get("timings", [])
            if not timings:
                fail("TTS", "empty timings")
            timing = timings[0]
            if timing["slideId"] != slide_ids[0]:
                fail("TTS slideId", f"expected {slide_ids[0]}, got {timing['slideId']}")
            if timing["duration"] <= 0:
                fail("TTS duration", f"expected >0, got {timing['duration']}")
            print(f"  ✓ TTS duration: {timing['duration']}s")

            audio_url = timing.get("audio", "")
            if audio_url:
                r = s.get(f"{base}{audio_url}", timeout=5)
                assert_ok(r, "audio stream")
                if "audio" not in r.headers.get("content-type", ""):
                    fail("audio content-type", r.headers.get("content-type"))
                print(f"  ✓ audio served ({len(r.content)} bytes)")

    # ── 9. 404s ────────────────────────────────────────────────────────────
    section("404 paths")
    r = s.get(f"{base}/api/projects/does-not-exist", timeout=5)
    assert_404(r, "unknown project bundle")
    r = s.get(f"{base}/api/projects/does-not-exist/composition", timeout=5)
    assert_404(r, "unknown project composition")
    r = s.get(f"{base}/api/projects/{pid}/composition/compositions/slide-9999", timeout=5)
    assert_404(r, "unknown slide")

    print(f"\n✓ E2E PASSED (project={pid}, slides={len(slide_ids)})\n")


if __name__ == "__main__":
    main()
