#!/usr/bin/env python3
"""End-to-end smoke test for the ovk SSR server.

Exercises the new schema-first `/api` surface against a running `ovk serve`:

  1. GET /api/projects              — project list is non-empty, well-shaped
  2. GET /api/projects/{id}         — ProjectBundle has root/slides/slideHtml
  3. GET /api/projects/{id}/composition
                                   — root HTML loads GSAP, hosts every slide,
                                     and emits a scene-swap timeline
  4. GET .../compositions/{slideId} — each slide sub-comp is stamped
                                     (titles present, NO leftover __OVK_*__ tokens)
  5. 404s for unknown project / slide

Usage:
  uv run --extra dev python scripts/test-e2e.py [base_url]

Defaults:
  base_url = http://127.0.0.1:8000

Requires `ovk serve` to already be running.
"""

from __future__ import annotations

import argparse
import sys

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
    parser.add_argument("base_url", nargs="?", default=DEFAULT_BASE,
                        help=f"Server base URL (default: {DEFAULT_BASE})")
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

    # ── 5. 404s ────────────────────────────────────────────────────────────
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
