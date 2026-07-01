/**
 * useActiveSlide — derive the active slide from the project + playhead.
 *
 * Returns the slide index, the slide itself, and its start time within the
 * timeline. Used by Stage (which slide to show), Properties (which fields
 * to bind), and Timeline (which clip is highlighted).
 */
import { useMemo } from "react";

import {
  cumulativeStarts,
  slideIndexAt,
} from "@/features/timeline/lib/cumulativeStarts";
import { usePlayhead } from "@/shared/store/playhead";

import type { ProjectBundle } from "../client";

export interface ActiveSlide {
  index: number;
  slideId: string | null;
  slide: ProjectBundle["slides"][string] | null;
  /** When the active slide starts in timeline time. */
  start: number;
  /** Time within the active slide (0..duration). */
  localTime: number;
}

export function useActiveSlide(project: ProjectBundle): ActiveSlide {
  const t = usePlayhead((s) => s.t);

  return useMemo(() => {
    const ids = project.root.slides;
    const durations = ids.map((id) => project.slides[id]?.duration ?? 0);
    const { starts, total } = cumulativeStarts(durations);
    void total;
    const idx = slideIndexAt(t, durations, starts);
    if (idx < 0) {
      return { index: -1, slideId: null, slide: null, start: 0, localTime: 0 };
    }
    const slideId = ids[idx];
    const slide = project.slides[slideId];
    const start = starts[idx];
    return {
      index: idx,
      slideId,
      slide,
      start,
      localTime: Math.max(0, Math.min(t - start, slide?.duration ?? 0)),
    };
  }, [project, t]);
}
