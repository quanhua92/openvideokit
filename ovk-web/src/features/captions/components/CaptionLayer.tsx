/**
 * CaptionLayer — word-level karaoke overlay synced to the playhead.
 *
 * Toggles `.word--active` CSS class per word. All visual properties are
 * driven by CSS custom properties derived from the user's caption settings
 * (preset + overrides). The rAF loop reads playhead via getState() (zero
 * React re-renders per frame).
 */
import { useEffect, useMemo, useRef } from "react";
import { splitSentences } from "@/features/voiceover/lib/text";
import type { CaptionStyle } from "@/shared/api/schemas/rootIndex";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";
import { useCaptionSettings } from "@/shared/store/captionSettings";
import { usePlayhead } from "@/shared/store/playhead";
import {
  timeWordsByCharRatio,
  type WordTiming,
} from "../lib/timeWordsByCharRatio";

/** Convert #rrggbb + alpha → rgba() string. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function CaptionLayer({
  slide,
  captionStyle: _captionStyle,
  activeStart,
}: {
  slide: SlideIndex;
  captionStyle: CaptionStyle;
  activeStart: number;
}) {
  void _captionStyle; // settings come from the store, not the prop

  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const { custom } = useCaptionSettings();

  const timings = useMemo(() => {
    const voText = slide.voiceover?.text ?? "";
    const sentences = splitSentences(voText);
    if (sentences.length === 0 || slide.duration <= 0) return [];
    const perSentence = sentences.map((s) => s.length);
    const total = perSentence.reduce((a, b) => a + b, 0) || 1;
    const all: WordTiming[] = [];
    let cursor = 0;
    sentences.forEach((sentence, sIdx) => {
      const sentenceDur = (perSentence[sIdx] / total) * slide.duration;
      const wt = timeWordsByCharRatio(sentence, cursor, sentenceDur);
      all.push(...wt);
      cursor += sentenceDur;
    });
    return all;
  }, [slide.voiceover?.text, slide.duration]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const globalT = usePlayhead.getState().t;
      const localT = globalT - activeStart;
      for (let i = 0; i < timings.length; i++) {
        const w = timings[i];
        const el = wordRefs.current[i];
        if (!el) continue;
        el.classList.toggle(
          "word--active",
          localT >= w.start && localT < w.end,
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timings, activeStart]);

  if (timings.length === 0) return null;

  // Derive CSS custom properties from user settings.
  const c = custom;
  const cssVars: Record<string, string> = {
    "--caption-scale": String(c.fontScale),
    "--caption-weight": String(c.fontWeight),
    "--caption-dim": hexToRgba(c.dimColor, c.dimOpacity),
    "--caption-active": c.activeColor,
    "--caption-letter-spacing": `${c.letterSpacing}em`,
    "--caption-pill-bg": c.pill ? c.pillColor : "transparent",
    "--caption-active-shadow": c.pill
      ? `0 0 20px ${c.pillColor}88, 0 2px 10px rgba(0,0,0,0.4)`
      : "none",
    "--caption-active-glow":
      c.glow > 0
        ? `drop-shadow(0 0 ${c.glow * 12}px ${c.activeColor})`
        : "none",
  };

  return (
    <div
      data-caption-shadow={c.shadow ? "1" : "0"}
      style={cssVars}
      className="caption-phrase pointer-events-none absolute inset-x-0 bottom-[8%] z-10 flex flex-wrap justify-center gap-x-[0.15em] gap-y-[0.1em] px-[6%] text-center leading-tight"
    >
      {timings.map((w, i) => (
        <span
          key={`${w.text}-${w.start.toFixed(3)}`}
          ref={(el) => {
            wordRefs.current[i] = el;
          }}
          className="word"
        >
          {w.text}
        </span>
      ))}
    </div>
  );
}
