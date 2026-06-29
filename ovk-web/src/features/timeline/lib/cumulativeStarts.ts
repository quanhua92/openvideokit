/**
 * Cumulative start times for sequential slides — port of `cumulativeStarts`
 * from the timeline_panel bundle.
 *
 * Slide N starts at sum(dur[0..N-1]) + N*gap. Total duration is sum(dur) +
 * (count-1)*gap. Pinned fixture: durations [4,5,3] gap 0 → starts [0,4,9],
 * total 12.
 */
export interface Timings {
	/** Start time of each slide, same length as input durations. */
	starts: number[];
	/** Total timeline duration including gaps. */
	total: number;
}

export function cumulativeStarts(durations: number[], gap = 0): Timings {
	const starts: number[] = [];
	let acc = 0;
	for (let i = 0; i < durations.length; i++) {
		starts.push(acc);
		acc += durations[i] + (i < durations.length - 1 ? gap : 0);
	}
	return { starts, total: acc };
}

/**
 * Find the index of the slide active at time `t`. Returns -1 if t is before
 * the first slide or after the last (clamped behavior is up to the caller).
 */
export function slideIndexAt(
	t: number,
	durations: number[],
	starts: number[],
): number {
	for (let i = 0; i < starts.length; i++) {
		const end = starts[i] + durations[i];
		if (t >= starts[i] && t < end) return i;
	}
	// After the end → clamp to last slide
	if (starts.length > 0 && t >= starts[starts.length - 1]) {
		return starts.length - 1;
	}
	return -1;
}
