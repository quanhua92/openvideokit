import { describe, expect, it } from "vitest";

import {
	countTag,
	extractTemplateContent,
	hasAttribute,
	hasHtmlWrapper,
	hasTailwind,
	lintHtml,
} from "./lintHtml";

const GOOD = `<template>
  <div data-composition-id="__SLIDE_ID__" data-width="1920" data-height="1080">
    <h1>__TITLE__</h1>
    <style>body { margin: 0; }</style>
  </div>
</template>`;

describe("helpers", () => {
	it("countTag counts opening tags", () => {
		expect(
			countTag("<template></template><template></template>", "template"),
		).toBe(2);
		expect(countTag("<div></div>", "template")).toBe(0);
	});

	it("extractTemplateContent returns inner HTML", () => {
		const inner = extractTemplateContent(GOOD);
		expect(inner).toContain("data-composition-id");
		expect(inner).toContain("__TITLE__");
	});

	it("extractTemplateContent returns empty string when no template", () => {
		expect(extractTemplateContent("<div>nope</div>")).toBe("");
	});

	it("hasAttribute checks for attr= in content", () => {
		expect(hasAttribute('<div data-x="1">', "data-x")).toBe(true);
		expect(hasAttribute("<div>nope</div>", "data-x")).toBe(false);
	});

	it("hasHtmlWrapper detects html/body outside template", () => {
		expect(hasHtmlWrapper("<html><template></template></html>")).toBe(true);
		expect(hasHtmlWrapper("<body><template></template></body>")).toBe(true);
		expect(hasHtmlWrapper(GOOD)).toBe(false);
	});

	it("hasTailwind detects CDN, @tailwind, @apply", () => {
		expect(hasTailwind('<script src="cdn.tailwindcss.com"></script>')).toBe(
			true,
		);
		expect(hasTailwind("@tailwind base;")).toBe(true);
		expect(hasTailwind(".btn { @apply px-4; }")).toBe(true);
		expect(hasTailwind(GOOD)).toBe(false);
	});
});

describe("lintHtml R1–R4", () => {
	it("passes a valid bare <template>", () => {
		expect(lintHtml(GOOD).ok).toBe(true);
	});

	it("R1: fails with zero templates", () => {
		const r = lintHtml("<div>no template</div>");
		expect(r.ok).toBe(false);
		expect(r.firedRule?.id).toBe("R1");
	});

	it("R1: fails with two templates", () => {
		const r = lintHtml("<template></template><template></template>");
		expect(r.ok).toBe(false);
		expect(r.firedRule?.id).toBe("R1");
	});

	it("R2: fails with <html> wrapper", () => {
		const r = lintHtml(
			'<html><template><div data-composition-id="x"></div></template></html>',
		);
		expect(r.ok).toBe(false);
		expect(r.firedRule?.id).toBe("R2");
	});

	it("R2: fails with <body> wrapper", () => {
		const r = lintHtml(
			'<body><template><div data-composition-id="x"></div></template></body>',
		);
		expect(r.ok).toBe(false);
		expect(r.firedRule?.id).toBe("R2");
	});

	it("R3: fails when data-composition-id is missing", () => {
		const r = lintHtml("<template><div>no comp id</div></template>");
		expect(r.ok).toBe(false);
		expect(r.firedRule?.id).toBe("R3");
	});

	it("R4: fails with Tailwind CDN", () => {
		const r = lintHtml(
			'<template><div data-composition-id="x"><script src="cdn.tailwindcss.com"></script></div></template>',
		);
		expect(r.ok).toBe(false);
		expect(r.firedRule?.id).toBe("R4");
	});

	it("R4: fails with @apply", () => {
		const r = lintHtml(
			'<template><div data-composition-id="x"><style>.b { @apply px-4; }</style></div></template>',
		);
		expect(r.ok).toBe(false);
		expect(r.firedRule?.id).toBe("R4");
	});

	it("first failing rule wins (R2 before R3)", () => {
		const r = lintHtml(
			"<html><template><div>no comp id</div></template></html>",
		);
		expect(r.firedRule?.id).toBe("R2");
	});
});
