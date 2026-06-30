/**
 * lintHtml — pure, sync lint predicates for slide `index.html` bare
 * `<template>` compositions. Ported from the `html_editor_surface` +
 * `bare_template` bundles.
 *
 * Rules (first failing rule wins):
 *   R1: exactly one `<template>`
 *   R2: no `<html>/<head>/<body>` outside `<template>`
 *   R3: extracted content has `data-composition-id`
 *   R4: no Tailwind (`cdn.tailwindcss.com` / `@tailwind` / `@apply`)
 *
 * Imported by BOTH the HtmlEditor (P5) and the AI Dock (P6) so AI Tier-2
 * proposals pass through the SAME gate.
 */

export interface LintResult {
	ok: boolean;
	firedRule?: { id: "R1" | "R2" | "R3" | "R4"; message: string };
}

/** Count occurrences of a tag in a string (case-insensitive, naive scan). */
export function countTag(src: string, tag: string): number {
	const re = new RegExp(`<${tag}[\\s/>]`, "gi");
	return (src.match(re) ?? []).length;
}

/** Extract the inner content of the first `<template>...</template>`. */
export function extractTemplateContent(src: string): string {
	const open = src.match(/<template[\s>]/i);
	if (!open || open.index === undefined) return "";
	const start = open.index + open[0].length;
	const close = src.slice(start).search(/<\/template>/i);
	if (close < 0) return "";
	return src.slice(start, start + close);
}

/** Check if `<html>`, `<head>`, or `<body>` appears OUTSIDE `<template>`. */
export function hasHtmlWrapper(src: string): boolean {
	const templateStart = src.search(/<template[\s>]/i);
	const templateEnd = src.search(/<\/template>/i);
	const before = templateStart > 0 ? src.slice(0, templateStart) : "";
	const after = templateEnd > 0 ? src.slice(templateEnd + 12) : "";
	const outside = `${before} ${after}`;
	return (
		/<html[\s>]/i.test(outside) ||
		/<head[\s>]/i.test(outside) ||
		/<body[\s>]/i.test(outside)
	);
}

/** Check if an attribute exists in the extracted template content. */
export function hasAttribute(inner: string, attr: string): boolean {
	return new RegExp(`${attr}\\s*=`, "i").test(inner);
}

/** Check for Tailwind usage (CDN script, @tailwind, @apply). */
export function hasTailwind(src: string): boolean {
	return (
		/cdn\.tailwindcss\.com/i.test(src) ||
		/@tailwind\s/.test(src) ||
		/@apply\s/.test(src)
	);
}

/**
 * Run R1–R4 in order. Returns ok:true if all pass, otherwise the first
 * failing rule.
 */
export function lintHtml(src: string): LintResult {
	if (src.trim() === "") {
		return { ok: true }; // Empty string means "clear custom override and use template default"
	}

	// R1: exactly one <template>
	const templateCount = countTag(src, "template");
	if (templateCount === 0) {
		return {
			ok: false,
			firedRule: {
				id: "R1",
				message: "missing <template> — slide HTML must be a bare <template>",
			},
		};
	}
	if (templateCount > 1) {
		return {
			ok: false,
			firedRule: {
				id: "R1",
				message: `expected 1 <template>, found ${templateCount}`,
			},
		};
	}

	// R2: no <html>/<head>/<body> outside <template>
	if (hasHtmlWrapper(src)) {
		return {
			ok: false,
			firedRule: {
				id: "R2",
				message:
					"<html>/<head>/<body> found outside <template> — HF renders wrapped templates blank (v0.7.3)",
			},
		};
	}

	// R3: extracted content has data-composition-id
	const inner = extractTemplateContent(src);
	if (!hasAttribute(inner, "data-composition-id")) {
		return {
			ok: false,
			firedRule: {
				id: "R3",
				message: "missing data-composition-id in <template> content",
			},
		};
	}

	// R4: no Tailwind
	if (hasTailwind(src)) {
		return {
			ok: false,
			firedRule: {
				id: "R4",
				message:
					"Tailwind detected — use vanilla CSS + GSAP in composition HTML (RFC §16)",
			},
		};
	}

	return { ok: true };
}
