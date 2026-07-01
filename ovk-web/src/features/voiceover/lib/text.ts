/**
 * Sentence splitter + deterministic text hash for the mock TTS pipeline.
 *
 * Naive on purpose — the goal is to feed `timeWordsByCharRatio` per
 * sentence. Vietnamese uses the same sentence-end punctuation (.;!?), so a
 * naive split works for both English and Vietnamese text.
 */

/**
 * Split text into sentences. Keeps decimal numbers intact (`3.14` is NOT
 * split). Trims each sentence and drops empty results.
 */
export function splitSentences(text: string): string[] {
  if (!text.trim()) return [];
  // Mark sentence boundaries. A `.`/`!`/`?` is a boundary if NOT preceded by
  // a digit AND followed by whitespace or end-of-string.
  const tokens = text.match(/[^.!?]*[.!?]+|\S[^.!?]*$/g) ?? [];
  return tokens.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * 32-bit FNV-1a hash. Deterministic: same input always produces the same
 * number. Used by the mock TTS endpoint to derive a duration from text so
 * fixtures are reproducible.
 */
export function textHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic mock duration for a sentence: hash the text, map to a
 * 2.0–6.0 second range. Same text → same duration (no test flakiness).
 */
export function mockSentenceDuration(text: string): number {
  const base = 2.0;
  const range = 4.0; // → 2.0..6.0 seconds
  return base + ((textHash(text) % 4000) / 1000) * (range / 4);
}

/**
 * Total mock duration for a slide = sum of sentence durations. Empty voice
 * text → 3.0s default (matches makeBlankSlide in applyOp).
 */
export function mockSlideDuration(voiceText: string): number {
  const sentences = splitSentences(voiceText);
  if (sentences.length === 0) return 3.0;
  return sentences.reduce((sum, s) => sum + mockSentenceDuration(s), 0);
}
