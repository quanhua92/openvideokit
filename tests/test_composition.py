"""Unit tests for composition.py — self-contained composition building."""

from __future__ import annotations

from openvideokit.composition import build_root_composition, build_slide_composition
from openvideokit.seed import fixture_project


class TestBuildSlideComposition:
    def test_stamps_slide_id(self):
        project = fixture_project()
        slide = project["slides"]["slide-0"]
        html = project["slideHtml"]["slide-0"]
        result = build_slide_composition(slide, html)
        assert 'data-composition-id="slide-0"' in result

    def test_stamps_title(self):
        project = fixture_project()
        slide = project["slides"]["slide-0"]
        html = project["slideHtml"]["slide-0"]
        result = build_slide_composition(slide, html)
        title = slide["fields"]["title"]
        assert title in result

    def test_no_leftover_tokens(self):
        project = fixture_project()
        slide = project["slides"]["slide-0"]
        html = project["slideHtml"]["slide-0"]
        result = build_slide_composition(slide, html)
        assert "__OVK_" not in result


class TestBuildRootComposition:
    def test_has_gsap(self):
        project = fixture_project()
        html = build_root_composition(project)
        assert "gsap" in html

    def test_has_stage(self):
        project = fixture_project()
        html = build_root_composition(project)
        assert 'id="stage"' in html

    def test_has_root_timeline(self):
        project = fixture_project()
        html = build_root_composition(project)
        assert "window.__timelines" in html
        assert "'root'" in html

    def test_no_sub_comp_refs(self):
        project = fixture_project()
        html = build_root_composition(project)
        assert "data-composition-src" not in html

    def test_all_slides_inlined(self):
        project = fixture_project()
        html = build_root_composition(project)
        for sid in project["root"]["slides"]:
            assert f'data-composition-id="{sid}"' in html

    def test_stamped_content_present(self):
        project = fixture_project()
        html = build_root_composition(project)
        title = project["slides"]["slide-0"]["fields"]["title"]
        assert title in html

    def test_total_duration(self):
        project = fixture_project()
        html = build_root_composition(project)
        total = sum(s["duration"] for s in project["slides"].values())
        assert f'data-duration="{total:.1f}"' in html

    def test_no_leftover_tokens(self):
        project = fixture_project()
        html = build_root_composition(project)
        assert "__OVK_" not in html
