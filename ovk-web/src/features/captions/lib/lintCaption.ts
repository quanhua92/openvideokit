/**
 * Caption CSS/JS lint predicates — enforce AGENTS.md CRITICAL RULES.
 *
 * Banned patterns on `.word--active`:
 *   - transform / scale() (causes layout shift / size jumping)
 *   - font-size (causes reflow)
 *   - text-shadow (causes repaint jumps)
 *   - GSAP className tweens (snaps instead of animating)
 *
 * CI runs these against every caption style CSS to catch regressions.
 */

export interface LintResult {
  ok: boolean;
  firedRule?: string;
  message?: string;
}

const BANNED_PROPERTIES: ReadonlyArray<{
  re: RegExp;
  rule: string;
  label: string;
}> = [
  { re: /transform\s*:/, rule: "no-transform", label: "transform" },
  { re: /scale\s*\(/, rule: "no-scale", label: "scale()" },
  { re: /font-size\s*:/, rule: "no-font-size", label: "font-size" },
  { re: /text-shadow\s*:/, rule: "no-text-shadow", label: "text-shadow" },
];

/**
 * Scan a CSS string for banned properties inside `.word--active` blocks.
 * Returns ok:true if no banned properties are used inside `.word--active`.
 * Banned properties OUTSIDE .word--active (e.g. on `.word` base style) are
 * allowed.
 */
export function lintCaptionCSS(css: string): LintResult {
  const blockRegex = /\.word--active\s*\{([^}]*)\}/g;
  const blocks: string[] = [];
  let m: RegExpExecArray | null = blockRegex.exec(css);
  while (m !== null) {
    blocks.push(m[1]);
    m = blockRegex.exec(css);
  }
  for (const body of blocks) {
    for (const b of BANNED_PROPERTIES) {
      if (b.re.test(body)) {
        return {
          ok: false,
          firedRule: b.rule,
          message: `banned '${b.label}' inside .word--active`,
        };
      }
    }
  }
  return { ok: true };
}

/**
 * Scan a JS string for GSAP `className:` tweens, which animate by diffing
 * CSS classes — they snap instead of tweening and conflict with CSS
 * transitions. Banned inside caption timeline builders.
 */
export function lintCaptionJS(js: string): LintResult {
  const regex = /\.(?:to|from|fromTo|set)\s*\([^)]*className\s*:/s;
  if (regex.test(js)) {
    return {
      ok: false,
      firedRule: "no-classname-tween",
      message:
        "GSAP className tween found — use direct property tweens (color, opacity) instead",
    };
  }
  return { ok: true };
}
