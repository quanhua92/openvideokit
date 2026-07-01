#!/usr/bin/env python3
"""End-to-end smoke test for OpenVideoKit.

Behaves like a real user:
  1. Lists templates
  2. Opens the editor page
  3. Fetches the template schema and builds form data dynamically
  4. Submits the form with custom text + an image upload
  5. Follows the redirect to the live preview
  6. Verifies the stamped composition loads and slots were substituted
  7. (Optional) Triggers a render and waits for the MP4

Usage:
  uv run --extra dev python scripts/test-e2e.py [base_url] [--template ID] [--render]

Defaults:
  base_url = http://127.0.0.1:8765
  template = first registered template
  --render is off by default (render takes ~45s)

Requires the server to already be running.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import requests

DEFAULT_BASE = "http://127.0.0.1:8765"
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def section(title: str) -> None:
    print(f"\n── {title} ───────────────────────────────────────────")


def assert_ok(resp: requests.Response, label: str) -> None:
    if resp.status_code >= 400:
        print(f"  ✗ {label}: HTTP {resp.status_code}")
        print(f"    body: {resp.text[:300]}")
        sys.exit(1)
    print(f"  ✓ {label}: HTTP {resp.status_code}")


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenVideoKit end-to-end smoke test")
    parser.add_argument("base_url", nargs="?", default=DEFAULT_BASE,
                        help=f"Server base URL (default: {DEFAULT_BASE})")
    parser.add_argument("--template", default=None,
                        help="Template ID to exercise (default: first registered)")
    parser.add_argument("--render", action="store_true",
                        help="Also trigger a render and wait for the MP4 (~45s)")
    parser.add_argument("--no-image", action="store_true",
                        help="Skip image uploads")
    args = parser.parse_args()

    s = requests.Session()
    s.headers["User-Agent"] = "openvideokit-e2e/1.0"

    # ── 1. List templates ───────────────────────────────────────────────────
    section("GET /api")
    r = s.get(f"{args.base_url}/api", timeout=5)
    assert_ok(r, "GET /api")
    info = r.json()
    templates = info.get("templates", [])
    print(f"  templates: {templates}")
    if not templates:
        print("  ✗ no templates registered")
        sys.exit(1)

    template_id = args.template or templates[0]
    if template_id not in templates:
        print(f"  ✗ template '{template_id}' not in {templates}")
        sys.exit(1)
    print(f"  using: {template_id}")

    # Also verify the HTML home page renders
    section("GET / (home)")
    r = s.get(f"{args.base_url}/", timeout=5)
    assert_ok(r, "home page")
    if "OpenVideoKit" not in r.text or f"/editor/{template_id}" not in r.text:
        print("  ✗ home page missing brand or template link")
        sys.exit(1)
    print("  brand + template card link found")

    # ── 2. Fetch schema ─────────────────────────────────────────────────────
    section(f"GET /api/templates/{template_id}")
    r = s.get(f"{args.base_url}/api/templates/{template_id}", timeout=5)
    assert_ok(r, "schema fetch")
    schema = r.json()
    slots = schema.get("slots", [])
    text_slots = [s for s in slots if s["type"] == "text"]
    image_slots = [s for s in slots if s["type"] == "image"]
    print(f"  text slots:  {[s['id'] for s in text_slots]}")
    print(f"  image slots: {[s['id'] for s in image_slots]}")

    # ── 3. Open editor ──────────────────────────────────────────────────────
    section(f"GET /editor/{template_id}")
    r = s.get(f"{args.base_url}/editor/{template_id}", timeout=5)
    assert_ok(r, "editor page")
    if "<form" not in r.text:
        print("  ✗ editor page missing form")
        sys.exit(1)
    print("  form found")

    # ── 4. Submit form (dynamic from schema) ────────────────────────────────
    section(f"POST /preview/{template_id}")
    marker = f"E2E@{int(time.time())}"

    form_data: dict[str, str] = {}
    expected_in_files: dict[str, list[str]] = {}  # path -> [slot_id, marker_value]
    for slot in text_slots:
        sid = slot["id"]
        value = f"{marker}:{sid}"
        form_data[sid] = value
        applies_to = slot.get("applies_to", "")
        if applies_to:
            expected_in_files.setdefault(applies_to, []).append(sid)
    print(f"  form data: {form_data}")

    files: dict[str, tuple[str, bytes, str]] = {}
    if not args.no_image:
        for slot in image_slots:
            sid = slot["id"]
            default_path = PROJECT_ROOT / "templates" / template_id / slot.get("default", "")
            if default_path.is_file():
                files[sid] = (default_path.name, default_path.read_bytes(), "application/octet-stream")
                print(f"  uploading {sid}: {default_path.name} ({default_path.stat().st_size} bytes)")

    r = s.post(
        f"{args.base_url}/preview/{template_id}",
        data=form_data,
        files=files,
        allow_redirects=False,
        timeout=10,
    )
    assert_ok(r, "POST /preview (no redirect)")
    if r.status_code != 303:
        print(f"  ✗ expected 303 redirect, got {r.status_code}")
        sys.exit(1)
    location = r.headers.get("location", "")
    session_id = location.rsplit("/", 1)[-1]
    print(f"  redirect → {location} (session_id={session_id})")

    # ── 5. Follow to preview page ───────────────────────────────────────────
    section(f"GET /preview/{session_id}")
    r = s.get(f"{args.base_url}{location}", timeout=5)
    assert_ok(r, "preview page")
    if "hyperframes-player" not in r.text:
        print("  ✗ preview page missing <hyperframes-player>")
        sys.exit(1)
    print("  hyperframes-player tag found")

    # ── 6. Verify slot substitution reached disk ────────────────────────────
    section("Verify stamped session files")
    r = s.get(f"{args.base_url}/session/{session_id}/index.html", timeout=5)
    assert_ok(r, "GET index.html")

    for file_path, slot_ids in expected_in_files.items():
        r = s.get(f"{args.base_url}/session/{session_id}/{file_path}", timeout=5)
        assert_ok(r, f"GET {file_path}")
        for sid in slot_ids:
            marker_val = f"{marker}:{sid}"
            if marker_val not in r.text:
                print(f"  ✗ slot '{sid}' not substituted in {file_path} (looking for: {marker_val!r})")
                sys.exit(1)
            print(f"  ✓ {sid} → {marker_val!r} in {file_path}")

    # Verify image assets are reachable
    for slot in image_slots:
        asset_path = slot.get("path", "")
        if asset_path:
            r = s.get(f"{args.base_url}/session/{session_id}/{asset_path}", timeout=5)
            assert_ok(r, f"GET {asset_path}")

    # ── 7. Optional: render ─────────────────────────────────────────────────
    if not args.render:
        section("Skipping render (pass --render to enable)")
        print(f"\n✓ E2E PASSED (preview-only mode, template={template_id})\n")
        return

    section(f"POST /render/{session_id}")
    r = s.post(f"{args.base_url}/render/{session_id}", allow_redirects=False, timeout=10)
    assert_ok(r, "POST /render (no redirect)")
    if r.status_code != 303:
        print(f"  ✗ expected 303 redirect, got {r.status_code}")
        sys.exit(1)
    job_location = r.headers.get("location", "")
    job_id = job_location.rsplit("/", 1)[-1]
    print(f"  redirect → {job_location} (job_id={job_id})")

    section(f"Poll /job/{job_id}")
    deadline = time.time() + 180
    while time.time() < deadline:
        r = s.get(f"{args.base_url}/job/{job_id}", timeout=5)
        assert_ok(r, "GET /job status")
        if "Status:</b> done" in r.text:
            print("  ✓ done")
            break
        if "Status:</b> failed" in r.text:
            print("  ✗ render failed — fetching log:")
            log = s.get(f"{args.base_url}/job/{job_id}/log", timeout=5)
            print(log.text[-2000:])
            sys.exit(1)
        if "Status:</b> running" in r.text:
            print("  running…")
        time.sleep(3)
    else:
        print("  ✗ render timed out after 180s")
        sys.exit(1)

    section(f"GET /download/{job_id}")
    r = s.get(f"{args.base_url}/download/{job_id}", timeout=30, stream=True)
    assert_ok(r, "GET /download")
    total = 0
    out_path = f"/tmp/openvideokit-e2e-{job_id}.mp4"
    with open(out_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=64 * 1024):
            f.write(chunk)
            total += len(chunk)
    print(f"  mp4 saved: {out_path} ({total} bytes)")
    print(f"\n✓ E2E PASSED (full pipeline, template={template_id})\n")


if __name__ == "__main__":
    main()
