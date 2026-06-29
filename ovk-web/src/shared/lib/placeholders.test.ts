import { describe, expect, it } from "vitest";

import {
	extractPlaceholders,
	placeholderFor,
	stampNaive,
	stampSafe,
} from "./placeholders";

describe("placeholderFor", () => {
	it("uppercases the field id", () => {
		expect(placeholderFor("title")).toBe("__TITLE__");
		expect(placeholderFor("body")).toBe("__BODY__");
	});

	it("handles multi-word ids", () => {
		expect(placeholderFor("hero_title")).toBe("__HERO_TITLE__");
	});
});

describe("stampSafe vs stampNaive", () => {
	const html = "<h1>__TITLE__</h1>";

	it("stampSafe preserves regex-special characters in the value", () => {
		// `$&` is a regex backreference — naive stamp would corrupt this.
		const value = "Price: $10 ($& special)";
		expect(stampSafe(html, "title", value)).toBe(
			`<h1>Price: $10 ($& special)</h1>`,
		);
	});

	it("stampNaive corrupts on $& (the bug we lock with this test)", () => {
		const value = "A $& B";
		const safe = stampSafe(html, "title", value);
		const naive = stampNaive(html, "title", value);
		// The whole point of this assertion: naive diverges.
		expect(naive).not.toBe(safe);
		expect(naive).not.toContain("$&");
	});

	it("stampSafe handles $$ patterns", () => {
		const value = "100$$ off";
		expect(stampSafe(html, "title", value)).toBe("<h1>100$$ off</h1>");
	});

	it("both stampers are no-ops when placeholder absent", () => {
		const noMatch = "<h1>no placeholder here</h1>";
		expect(stampSafe(noMatch, "title", "x")).toBe(noMatch);
		expect(stampNaive(noMatch, "title", "x")).toBe(noMatch);
	});
});

describe("extractPlaceholders", () => {
	it("lists placeholders in order, deduped", () => {
		const src = `
			<div data-composition-id="__SLIDE_ID__">
				<h1>__TITLE__</h1>
				<p>__BODY__</p>
				<img src="__IMAGE__"/>
				<h2>__TITLE__ again</h2>
			</div>
		`;
		expect(extractPlaceholders(src)).toEqual([
			"__SLIDE_ID__",
			"__TITLE__",
			"__BODY__",
			"__IMAGE__",
		]);
	});

	it("returns empty for placeholder-free strings", () => {
		expect(extractPlaceholders("<div>no markers</div>")).toEqual([]);
	});

	it("does not match lowercase markers", () => {
		expect(extractPlaceholders("<div>__lowercase__</div>")).toEqual([]);
	});

	it("matches uppercase markers containing digits (e.g. __FIELD_1__)", () => {
		expect(extractPlaceholders("<div>__FIELD_1__</div>")).toEqual([
			"__FIELD_1__",
		]);
	});
});
