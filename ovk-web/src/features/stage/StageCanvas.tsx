/**
 * StageCanvas — letterboxed preview of the active slide + caption overlay.
 *
 * CRITICAL: CaptionLayer lives OUTSIDE the `transform: scale()` div so
 * caption text renders at real viewport resolution (not shrunken). A
 * gradient scrim behind the captions ensures legibility against any slide
 * background.
 *
 * Slide images: loaded from IndexedDB by SHA-256 ref via useAssetUrl,
 * displayed as a cover background behind the title/body text.
 */
import { useEffect, useRef, useState } from "react";
import { useAssetUrl } from "@/features/assets/hooks/useAssetUrl";
import { CaptionLayer } from "@/features/captions/components/CaptionLayer";
import DEFAULT_SHELL from "@/features/html-editor/default.html?raw";
import type { CaptionStyle } from "@/shared/api/schemas/rootIndex";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";
import { stampSafe } from "@/shared/lib/placeholders";
import { useCaptionSettings } from "@/shared/store/captionSettings";

import { scaleToFit } from "./lib/scale";

const SOURCE = { width: 1920, height: 1080 };

export function StageCanvas({
  slide,
  localTime,
  activeStart,
  captionStyle,
  slideHtml,
}: {
  slide: SlideIndex | null;
  localTime: number;
  activeStart: number;
  captionStyle: CaptionStyle;
  slideHtml?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const { custom: captionCustom } = useCaptionSettings();

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

  void localTime;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-neutral-950"
      style={{ containerType: "inline-size" }}
    >
      {/* Scaled slide canvas — 1920x1080 content */}
      <div
        className="absolute"
        style={{
          width: SOURCE.width,
          height: SOURCE.height,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {slide ? (
          <>
            <HtmlView slide={slide} html={slideHtml || DEFAULT_SHELL} />
            {/* Caption overlay — INSIDE the scale, matching HyperFrames 1080p canvas.
							Scrim only renders when captions exist AND the user has it on. */}
            {slide.voiceover.text.trim() && (
              <>
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
              </>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-500">
            No active slide
          </div>
        )}
      </div>
    </div>
  );
}

function HtmlView({ slide, html }: { slide: SlideIndex; html: string }) {
  const imgUrl = useAssetUrl(slide.assets.img) ?? "";

  let processedHtml = html.replace(/<\/?template>/gi, "");
  processedHtml = stampSafe(processedHtml, "SLIDE_ID", slide.id);
  for (const [id, value] of Object.entries(slide.fields)) {
    processedHtml = stampSafe(processedHtml, id, value);
  }
  processedHtml = stampSafe(processedHtml, "image", imgUrl);
  // Blank any leftover tokens so unreplaced placeholders never render literally.
  processedHtml = processedHtml.replace(/__OVK_[A-Z0-9_]*__/g, "");

  return (
    <>
      <style>{`.html-view-host > div { width: 100%; height: 100%; }`}</style>
      <div
        className="html-view-host"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
        dangerouslySetInnerHTML={{ __html: processedHtml }}
      />
    </>
  );
}
