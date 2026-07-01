/**
 * StageCanvas — letterboxed preview driven by <hyperframes-player>.
 *
 * The player loads the self-contained root composition (all slides inlined,
 * one GSAP timeline registered as window.__timelines['root']) from the SSR
 * server.  Because the composition has no data-composition-src elements, the
 * player's probe resolves the direct-timeline adapter and drives GSAP
 * directly — no HF runtime injection, no postMessage, just same-origin
 * `timeline.seek()`.
 *
 * Our playhead store (usePlayhead) is the master clock.  A Zustand
 * subscription pushes playhead.t → player.currentTime on every change WITHOUT
 * triggering React re-renders (same pattern as the caption rAF loop).
 *
 * CaptionLayer lives in a transparent overlay scaled to match the player's
 * 1920×1080 coordinate system.
 */
import type { HyperframesPlayer } from "@hyperframes/player";
import { useEffect, useRef, useState } from "react";
import { CaptionLayer } from "@/features/captions/components/CaptionLayer";
import type { CaptionStyle } from "@/shared/api/schemas/rootIndex";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";
import { compositionUrl } from "@/shared/config";
import { useCaptionSettings } from "@/shared/store/captionSettings";
import { usePlayhead } from "@/shared/store/playhead";

import { scaleToFit } from "./lib/scale";

const SOURCE = { width: 1920, height: 1080 };

export function StageCanvas({
  projectId,
  slide,
  activeStart,
  captionStyle,
}: {
  projectId: string;
  slide: SlideIndex | null;
  activeStart: number;
  captionStyle: CaptionStyle;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HyperframesPlayer>(null);
  const [scale, setScale] = useState(0.2);
  const [ready, setReady] = useState(false);
  const { custom: captionCustom } = useCaptionSettings();

  // Measure container → compute caption overlay scale (matches the player's
  // internal scale-to-fit of the 1920×1080 composition).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setScale(scaleToFit(SOURCE, { width: r.width, height: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Push playhead → player.currentTime (master clock → slave renderer).
  // Uses a raw Zustand subscription so this never triggers React re-renders.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onReady = () => {
      setReady(true);
      player.currentTime = usePlayhead.getState().t;
    };
    player.addEventListener("ready", onReady);

    const unsub = usePlayhead.subscribe((state) => {
      if (player.ready) player.currentTime = state.t;
    });

    return () => {
      player.removeEventListener("ready", onReady);
      unsub();
    };
  }, []);

  const showCaptions = !!slide?.voiceover.text.trim();

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-neutral-950"
    >
      {/* HF player — owns the 1920×1080 surface, auto-scales to fit */}
      <hyperframes-player
        ref={playerRef}
        src={compositionUrl(projectId)}
        style={{ width: "100%", height: "100%" }}
      />

      {/* Caption overlay — transparent, scaled to 1080p coords */}
      {showCaptions && slide && (
        <div
          className="pointer-events-none absolute"
          style={{
            width: SOURCE.width,
            height: SOURCE.height,
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          {captionCustom.scrim && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)",
              }}
            />
          )}
          <CaptionLayer
            slide={slide}
            captionStyle={captionStyle}
            activeStart={activeStart}
          />
        </div>
      )}

      {/* Loading state while the player probes the composition */}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-sm text-neutral-600">Loading preview…</div>
        </div>
      )}
    </div>
  );
}
