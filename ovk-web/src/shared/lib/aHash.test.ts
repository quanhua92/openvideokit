import { describe, expect, it } from "vitest";

import { aHash, cacheDecision, hamming, mean } from "./aHash";

// 8×8 mock frames. Values 0–255 (grayscale).
const A: number[][] = [
	[10, 20, 30, 40, 50, 60, 70, 80],
	[90, 100, 110, 120, 130, 140, 150, 160],
	[170, 180, 190, 200, 210, 220, 230, 240],
	[10, 20, 30, 40, 50, 60, 70, 80],
	[90, 100, 110, 120, 130, 140, 150, 160],
	[170, 180, 190, 200, 210, 220, 230, 240],
	[10, 20, 30, 40, 50, 60, 70, 80],
	[90, 100, 110, 120, 130, 140, 150, 160],
];

// A' = A with one cell changed by 1 (distance 1)
const A_PRIME = A.map((row, r) =>
	row.map((v, c) => (r === 0 && c === 0 ? v + 1 : v)),
);

// B = very different frame
const B: number[][] = [
	[200, 200, 200, 200, 200, 200, 200, 200],
	[200, 200, 200, 200, 200, 200, 200, 200],
	[200, 200, 200, 200, 200, 200, 200, 200],
	[200, 200, 200, 200, 200, 200, 200, 200],
	[200, 200, 200, 200, 200, 200, 200, 200],
	[200, 200, 200, 200, 200, 200, 200, 200],
	[200, 200, 200, 200, 200, 200, 200, 200],
	[200, 200, 200, 200, 200, 200, 200, 200],
];

describe("mean", () => {
	it("returns the arithmetic mean of all cells", () => {
		const m = mean([
			[1, 2],
			[3, 4],
		]);
		expect(m).toBe(2.5);
	});

	it("returns 0 for empty input", () => {
		expect(mean([])).toBe(0);
	});
});

describe("aHash", () => {
	it("produces an 8×8 grid of 0s and 1s", () => {
		const h = aHash(A);
		expect(h).toHaveLength(8);
		for (const row of h) {
			expect(row).toHaveLength(8);
			for (const bit of row) {
				expect(bit === 0 || bit === 1).toBe(true);
			}
		}
	});
});

describe("hamming", () => {
	it("returns 0 for identical hashes", () => {
		const h = aHash(A);
		expect(hamming(h, h)).toBe(0);
	});

	it("returns a small distance for 1-cell jitter (≤ 1)", () => {
		const h1 = aHash(A);
		const h2 = aHash(A_PRIME);
		expect(hamming(h1, h2)).toBeLessThanOrEqual(1);
	});

	it("returns a large distance for very different frames", () => {
		const h1 = aHash(A);
		const h2 = aHash(B);
		expect(hamming(h1, h2)).toBeGreaterThan(10);
	});
});

describe("cacheDecision", () => {
	it("returns HIT for distance ≤ 5", () => {
		expect(cacheDecision(0)).toBe("HIT");
		expect(cacheDecision(5)).toBe("HIT");
	});

	it("returns MISS for distance > 5", () => {
		expect(cacheDecision(6)).toBe("MISS");
		expect(cacheDecision(32)).toBe("MISS");
	});
});
