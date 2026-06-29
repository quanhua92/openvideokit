/**
 * Word-level karaoke timing by char ratio — port of `timeWordsByCharRatio`
 * from the captions_karaoke bundle.
 *
 * Each word's duration is proportional to its character count. Invariants
 * (asserted in tests):
 *   Σ ratioᵢ === 1.0
 *   Σ durᵢ   === sentenceDur
 *   endᵢ     === startᵢ + durᵢ
 *
 * Used by CaptionLayer to drive per-word color tweens synced to playhead.
 */

export interface WordTiming {
	/** Word index in the sentence (0-based). */
	i: number;
	/** The word text (no whitespace). */
	text: string;
	/** Character count. */
	chars: number;
	/** Char ratio in [0,1]; sum of all ratios is 1. */
	ratio: number;
	/** Absolute start time (seconds) within the slide timeline. */
	start: number;
	/** Duration (seconds). */
	dur: number;
	/** Absolute end time. */
	end: number;
}

/**
 * Split a sentence into words. Naive whitespace split — punctuation stays
 * attached to the word it touches. Empty input → empty array.
 */
export function splitWords(sentence: string): string[] {
	return sentence
		.trim()
		.split(/\s+/)
		.filter((w) => w.length > 0);
}

export function timeWordsByCharRatio(
	sentence: string,
	sentenceStart: number,
	sentenceDur: number,
): WordTiming[] {
	const words = splitWords(sentence);
	if (words.length === 0 || sentenceDur <= 0) return [];

	const totalChars = words.reduce((sum, w) => sum + w.length, 0);
	if (totalChars === 0) return [];

	let cursor = sentenceStart;
	return words.map((text, i) => {
		const chars = text.length;
		const ratio = chars / totalChars;
		const dur = ratio * sentenceDur;
		const start = cursor;
		const end = start + dur;
		cursor = end;
		return { i, text, chars, ratio, start, dur, end };
	});
}
