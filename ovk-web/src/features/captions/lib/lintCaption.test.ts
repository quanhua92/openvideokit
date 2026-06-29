import { describe, expect, it } from "vitest";

import { lintCaptionCSS, lintCaptionJS } from "./lintCaption";

describe("lintCaptionCSS", () => {
	it("passes a clean .word--active block (color-only change)", () => {
		const css = `.word--active { color: #ffea00; }`;
		expect(lintCaptionCSS(css).ok).toBe(true);
	});

	it("flags transform inside .word--active", () => {
		const css = `.word--active { transform: scale(1.15); }`;
		const r = lintCaptionCSS(css);
		expect(r.ok).toBe(false);
		expect(r.firedRule).toBe("no-transform");
	});

	it("flags scale() inside .word--active", () => {
		const css = `.word--active { transform: scale(1.1) translateX(2px); }`;
		expect(lintCaptionCSS(css).ok).toBe(false);
	});

	it("flags font-size inside .word--active", () => {
		const css = `.word--active { font-size: 56px; }`;
		expect(lintCaptionCSS(css).ok).toBe(false);
	});

	it("flags text-shadow inside .word--active", () => {
		const css = `.word--active { text-shadow: 0 0 30px rgba(255,234,0,0.6); }`;
		expect(lintCaptionCSS(css).ok).toBe(false);
	});

	it("ALLOWS text-shadow on the base .word (not .word--active)", () => {
		const css = `.word { text-shadow: 0 4px 20px rgba(0,0,0,0.8); }`;
		expect(lintCaptionCSS(css).ok).toBe(true);
	});

	it("ALLOWS transform on the base .word", () => {
		const css = `.word { transform: translateY(0); }`;
		expect(lintCaptionCSS(css).ok).toBe(true);
	});

	it("passes a full clean stylesheet (no banned patterns in .word--active)", () => {
		const css = `
			.word { display: inline-block; color: rgba(255,255,255,0.4); }
			.word--active { color: #ffea00; }
		`;
		expect(lintCaptionCSS(css).ok).toBe(true);
	});
});

describe("lintCaptionJS", () => {
	it("passes a direct-color tween", () => {
		const js = `tl.to(word, { color: '#ffea00', duration: 0.15 }, wordStart);`;
		expect(lintCaptionJS(js).ok).toBe(true);
	});

	it("flags a GSAP className tween", () => {
		const js = `tl.to(word, { className: '+=word--active', duration: 0.05 }, start);`;
		const r = lintCaptionJS(js);
		expect(r.ok).toBe(false);
		expect(r.firedRule).toBe("no-classname-tween");
	});

	it("flags className in any gsap method (to/from/fromTo/set)", () => {
		expect(lintCaptionJS(`gsap.set(el, { className: 'x' })`).ok).toBe(false);
		expect(lintCaptionJS(`gsap.from(el, { className: 'x' })`).ok).toBe(false);
	});
});
