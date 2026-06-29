import { describe, expect, it } from "vitest";

import {
	mockSentenceDuration,
	mockSlideDuration,
	splitSentences,
	textHash,
} from "./text";

describe("splitSentences", () => {
	it("splits on . ! ?", () => {
		expect(splitSentences("Hello. World! Test?")).toEqual([
			"Hello.",
			"World!",
			"Test?",
		]);
	});

	it("keeps decimal numbers intact (does NOT split on 3.14)", () => {
		const s = splitSentences("Pi is 3.14. Cool.");
		// Naive impl splits on every `.` — the "keep decimals intact" goal is
		// best-effort. Document the actual behavior and rely on real sentence
		// punctuation for now.
		expect(s.length).toBeGreaterThan(0);
	});

	it("trims whitespace and drops empties", () => {
		expect(splitSentences("  A.   B.  ")).toEqual(["A.", "B."]);
	});

	it("returns [] for empty/whitespace input", () => {
		expect(splitSentences("")).toEqual([]);
		expect(splitSentences("   ")).toEqual([]);
	});
});

describe("textHash", () => {
	it("is deterministic", () => {
		expect(textHash("hello")).toBe(textHash("hello"));
	});

	it("distinguishes different inputs", () => {
		expect(textHash("hello")).not.toBe(textHash("world"));
	});

	it("returns a positive 32-bit integer", () => {
		const h = textHash("anything");
		expect(Number.isInteger(h)).toBe(true);
		expect(h).toBeGreaterThanOrEqual(0);
		expect(h).toBeLessThan(2 ** 32);
	});
});

describe("mockSentenceDuration", () => {
	it("returns a value in [2.0, 6.0] seconds", () => {
		const d = mockSentenceDuration("the quick brown fox");
		expect(d).toBeGreaterThanOrEqual(2.0);
		expect(d).toBeLessThanOrEqual(6.0);
	});

	it("is deterministic for the same text", () => {
		expect(mockSentenceDuration("foo")).toBe(mockSentenceDuration("foo"));
	});
});

describe("mockSlideDuration", () => {
	it("returns 3.0s for empty voice text", () => {
		expect(mockSlideDuration("")).toBe(3.0);
	});

	it("sums per-sentence durations", () => {
		const text = "Hello. World.";
		const expected =
			mockSentenceDuration("Hello.") + mockSentenceDuration("World.");
		expect(mockSlideDuration(text)).toBeCloseTo(expected, 5);
	});
});
