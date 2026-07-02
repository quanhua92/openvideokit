"""Port of ovk-web/src/shared/lib/lintHtml.test.ts (R1–R5)."""

from __future__ import annotations

from openvideokit.ai.tools._lint import (
    count_tag,
    extract_placeholders,
    extract_template_content,
    has_attribute,
    has_html_wrapper,
    has_tailwind,
    lint_html,
)

GOOD = """<template>
  <div data-composition-id="__OVK_SLIDE_ID__" data-width="1920" data-height="1080">
    <h1>__OVK_TITLE__</h1>
    <style>body { margin: 0; }</style>
  </div>
</template>"""


class TestHelpers:
    def test_count_tag(self):
        assert count_tag("<template></template><template></template>", "template") == 2
        assert count_tag("<div></div>", "template") == 0

    def test_extract_template_content(self):
        inner = extract_template_content(GOOD)
        assert "data-composition-id" in inner
        assert "__OVK_TITLE__" in inner

    def test_extract_template_content_none(self):
        assert extract_template_content("<div>nope</div>") == ""

    def test_has_attribute(self):
        assert has_attribute('<div data-x="1">', "data-x")
        assert not has_attribute("<div>nope</div>", "data-x")

    def test_has_html_wrapper(self):
        assert has_html_wrapper("<html><template></template></html>")
        assert has_html_wrapper("<body><template></template></body>")
        assert not has_html_wrapper(GOOD)

    def test_has_tailwind(self):
        assert has_tailwind('<script src="cdn.tailwindcss.com"></script>')
        assert has_tailwind("@tailwind base;")
        assert has_tailwind(".btn { @apply px-4; }")
        assert not has_tailwind(GOOD)

    def test_extract_placeholders(self):
        tokens = extract_placeholders('<div>__OVK_TITLE__ __OVK_BODY__ __OVK_TITLE__</div>')
        assert tokens == ["__OVK_TITLE__", "__OVK_BODY__"]


class TestR1ToR4:
    def test_good_passes(self):
        assert lint_html(GOOD).ok

    def test_empty_passes(self):
        assert lint_html("").ok
        assert lint_html("   \n").ok

    def test_r1_zero_templates(self):
        r = lint_html("<div>no template</div>")
        assert not r.ok and r.fired_rule_id == "R1"

    def test_r1_two_templates(self):
        r = lint_html("<template></template><template></template>")
        assert not r.ok and r.fired_rule_id == "R1"

    def test_r2_html_wrapper(self):
        r = lint_html('<html><template><div data-composition-id="x"></div></template></html>')
        assert not r.ok and r.fired_rule_id == "R2"

    def test_r2_body_wrapper(self):
        r = lint_html('<body><template><div data-composition-id="x"></div></template></body>')
        assert not r.ok and r.fired_rule_id == "R2"

    def test_r3_missing_composition_id(self):
        r = lint_html("<template><div>no comp id</div></template>")
        assert not r.ok and r.fired_rule_id == "R3"

    def test_r4_tailwind_cdn(self):
        r = lint_html(
            '<template><div data-composition-id="x"><script src="cdn.tailwindcss.com"></script></div></template>'
        )
        assert not r.ok and r.fired_rule_id == "R4"

    def test_r4_apply(self):
        r = lint_html(
            '<template><div data-composition-id="x"><style>.b { @apply px-4; }</style></div></template>'
        )
        assert not r.ok and r.fired_rule_id == "R4"

    def test_first_failing_wins_r2_before_r3(self):
        r = lint_html("<html><template><div>no comp id</div></template></html>")
        assert r.fired_rule_id == "R2"


class TestR5:
    def test_good_passes(self):
        assert lint_html(GOOD).ok

    def test_custom_escape_hatch_passes(self):
        r = lint_html(
            '<template><div data-composition-id="x"><p>__OVK_CUSTOM_COMMAND__</p></div></template>'
        )
        assert r.ok

    def test_unknown_schema_token_fails(self):
        r = lint_html(
            '<template><div data-composition-id="x"><p>__OVK_NONEXISTENT__</p></div></template>'
        )
        assert not r.ok and r.fired_rule_id == "R5"

    def test_legacy_non_namespaced_token_fails(self):
        r = lint_html(
            '<template><div data-composition-id="x"><p>__TITLE__</p></div></template>'
        )
        assert not r.ok and r.fired_rule_id == "R5"
