/**
 * aHash — perceptual hash for visual determinism (RFC §11).
 *
 * 8×8 grayscale → mean → bit = (pixel > mean). Two frames with the same
 * aHash are visually equivalent. Used by the render cache to skip
 * unchanged slides.
 *
 * Ported from the visual_determinism bundle.
 */

/** Compute the arithmetic mean of a 2D number grid. */
export function mean(frame: number[][]): number {
	let sum = 0;
	let count = 0;
	for (const row of frame) {
		for (const v of row) {
			sum += v;
			count++;
		}
	}
	return count === 0 ? 0 : sum / count;
}

/**
 * Compute aHash: 8×8 bit grid where bit = (pixel > mean).
 * Returns a number[][] of 0/1 values.
 */
export function aHash(frame: number[][]): number[][] {
	const m = mean(frame);
	const rows = frame.length;
	const cols = frame[0]?.length ?? 0;
	const result: number[][] = [];
	for (let r = 0; r < rows; r++) {
		const row: number[] = [];
		for (let c = 0; c < cols; c++) {
			row.push(frame[r][c] > m ? 1 : 0);
		}
		result.push(row);
	}
	return result;
}

/**
 * Hamming distance between two bit grids of the same shape.
 * Counts positions where the bits differ (popcount of XOR).
 */
export function hamming(h1: number[][], h2: number[][]): number {
	let dist = 0;
	for (let r = 0; r < h1.length; r++) {
		for (let c = 0; c < h1[r].length; c++) {
			if ((h1[r]?.[c] ?? 0) !== (h2[r]?.[c] ?? 0)) dist++;
		}
	}
	return dist;
}

/** Cache threshold: distance ≤ CACHE_THRESHOLD means visual HIT. */
export const CACHE_THRESHOLD = 5;

/** Decide HIT or MISS based on Hamming distance. */
export function cacheDecision(distance: number): "HIT" | "MISS" {
	return distance <= CACHE_THRESHOLD ? "HIT" : "MISS";
}
