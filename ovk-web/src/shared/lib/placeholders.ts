/**
 * Placeholder + stamping utilities — ported from the `data_binding` bundle.
 *
 * Two stampers are provided:
 *   - stampNaive: CORRUPTS on `$$ $& $` $'` (kept for the negative Vitest)
 *   - stampSafe:  ALWAYS uses the function form of replaceAll → safe
 *
 * Per AGENTS.md: __FIELD__ replacement is the data-injection mechanism
 * (HF's getVariables() returns {} in sub-compositions).
 */

/** Field id → __FIELD__ (uppercased). e.g. title → __TITLE__ */
export function placeholderFor(id: string): string {
	return `__${id.toUpperCase()}__`;
}

/**
 * NAIVE stamp — corrupts when value contains regex-special patterns
 * like `$$ $& $` $'`. Kept here ONLY so Vitest can pin the bug.
 */
export function stampNaive(html: string, id: string, value: string): string {
	return html.replaceAll(placeholderFor(id), value);
}

/**
 * SAFE stamp — always uses the function form so replacement patterns
 * in the value are inserted literally. Use this everywhere.
 */
export function stampSafe(html: string, id: string, value: string): string {
	// The replacer function returns the value verbatim — replaceAll does NOT
	// interpret `$$`, `$&`, etc. when a function is provided.
	return html.replaceAll(placeholderFor(id), () => value);
}

/** Extract all `__FIELD__` placeholders from a string, deduped, in order. */
export function extractPlaceholders(src: string): string[] {
	const re = /__[A-Z0-9_]+__/g;
	const seen = new Set<string>();
	const out: string[] = [];
	for (const m of src.matchAll(re)) {
		if (!seen.has(m[0])) {
			seen.add(m[0]);
			out.push(m[0]);
		}
	}
	return out;
}
