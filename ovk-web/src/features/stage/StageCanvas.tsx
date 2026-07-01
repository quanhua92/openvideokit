/**
 * StageCanvas — letterboxed preview driven by <hyperframes-player>.
 *
 * The player loads the self-contained root composition (all slides inlined
 * with caption layer + GSAP timeline) from the SSR server. Captions are now
 * baked into the composition HTML — no separate React overlay needed.
 */
import type { HyperframesPlayer } from "@hyperframes/player";
import { useEffect, useRef, useState } from "react";
import type { CaptionStyle } from "@/shared/api/schemas/rootIndex";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";
import { compositionUrl } from "@/shared/config";
import { useAudioUrls } from "@/shared/store/audioUrls";
import { useCompositionVersion } from "@/shared/store/compositionVersion";
import { usePlayhead } from "@/shared/store/playhead";

export function StageCanvas({
  projectId,
  slide,
  activeStart,
  captionStyle: _captionStyle,
}: {
  projectId: string;
  slide: SlideIndex | null;
  activeStart: number;
  captionStyle: CaptionStyle;
}) {
  void _captionStyle;

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HyperframesPlayer>(null);
  const [ready, setReady] = useState(0);
  const version = useCompositionVersion((s) => s.version);
  const audioUrls = useAudioUrls((s) => s.urls);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Push playhead → player.currentTime (master clock → slave renderer).
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onReady = () => {
      setReady((n) => n + 1);
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

  const audioUrl = slide ? audioUrls[slide.id] : undefined;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-neutral-950"
    >
      {/* HF player — owns the 1920×1080 surface, auto-scales to fit.
          Captions are baked into the composition HTML. */}
      <hyperframes-player
        ref={playerRef}
        src={`${compositionUrl(projectId)}?v=${version}`}
        style={{ width: "100%", height: "100%" }}
      />

      {/* Voiceover audio — recreated (key=url) on TTS change for clean load */}
      {audioUrl && (
        <>
          {/* biome-ignore lint/a11y/useMediaCaption: captions in composition */}
          <audio
            key={audioUrl}
            ref={audioRef}
            className="hidden"
            src={audioUrl}
            preload="auto"
          />
          <AudioSync audioRef={audioRef} activeStart={activeStart} />
        </>
      )}

      {/* Loading state while the player probes the composition */}
      {ready === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-sm text-neutral-600">Loading preview…</div>
        </div>
      )}
    </div>
  );
}

/**
 * AudioSync — mounts inside the same key={audioUrl} block as the <audio>
 * element, so it gets a fresh subscription every time the URL changes.
 * Drives play/pause/seek from the playhead store.
 */
function AudioSync({
  audioRef,
  activeStart,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  activeStart: number;
}) {
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const unsub = usePlayhead.subscribe((state) => {
      if (!el || !el.src) return;
      const localT = state.t - activeStart;
      if (Math.abs(el.currentTime - localT) > 0.3) {
        el.currentTime = Math.max(0, localT);
      }
      if (state.playing && el.paused) {
        el.play().catch(() => {});
      }
      if (!state.playing && !el.paused) {
        el.pause();
      }
    });

    if (usePlayhead.getState().playing) {
      el.play().catch(() => {});
    }

    return () => {
      unsub();
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, [audioRef, activeStart]);

  return null;
}
