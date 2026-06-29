import { describe, expect, it } from "vitest";

import { cumulativeStarts, slideIndexAt } from "./cumulativeStarts";

describe("cumulativeStarts", () => {
	it("matches the pinned bundle fixture: [4,5,3] gap 0", () => {
		const r = cumulativeStarts([4, 5, 3], 0);
		expect(r.starts).toEqual([0, 4, 9]);
		expect(r.total).toBe(12);
	});

	it("adds gap between slides only (not after last)", () => {
		const r = cumulativeStarts([4, 5, 3], 0.8);
		// 0, 4+0.8=4.8, 4.8+5+0.8=10.6
		expect(r.starts[0]).toBeCloseTo(0);
		expect(r.starts[1]).toBeCloseTo(4.8);
		expect(r.starts[2]).toBeCloseTo(10.6);
		// total = 4 + 0.8 + 5 + 0.8 + 3 = 13.6 (no gap after last slide)
		expect(r.total).toBeCloseTo(13.6);
	});

	it("handles single slide", () => {
		const r = cumulativeStarts([7], 0.8);
		expect(r.starts).toEqual([0]);
		expect(r.total).toBe(7);
	});

	it("handles empty input", () => {
		const r = cumulativeStarts([], 0.8);
		expect(r.starts).toEqual([]);
		expect(r.total).toBe(0);
	});

	it("defaults gap to 0", () => {
		const r = cumulativeStarts([2, 3]);
		expect(r.starts).toEqual([0, 2]);
		expect(r.total).toBe(5);
	});
});

describe("slideIndexAt", () => {
	const durations = [4, 5, 3];
	const starts = [0, 4, 9];

	it("returns -1 before the first slide", () => {
		expect(slideIndexAt(-1, durations, starts)).toBe(-1);
	});

	it("returns the active slide index within its range", () => {
		expect(slideIndexAt(0, durations, starts)).toBe(0);
		expect(slideIndexAt(3.9, durations, starts)).toBe(0);
		expect(slideIndexAt(4, durations, starts)).toBe(1);
		expect(slideIndexAt(8.9, durations, starts)).toBe(1);
		expect(slideIndexAt(9, durations, starts)).toBe(2);
	});

	it("clamps to last slide past the end", () => {
		expect(slideIndexAt(12, durations, starts)).toBe(2);
		expect(slideIndexAt(99, durations, starts)).toBe(2);
	});
});
