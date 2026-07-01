/**
 * TransportBar — play/pause + scrubber + time readout.
 *
 * Visible on every breakpoint (above timeline on desktop, below stage on
 * mobile). The slider uses a local-value pattern so per-drag updates don't
 * re-render the entire studio: the slider holds its own state while dragging
 * and commits to the playhead store on change.
 */
import { Pause, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { usePlayhead } from "@/shared/store/playhead";

function formatTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TransportBar() {
  const t = usePlayhead((s) => s.t);
  const duration = usePlayhead((s) => s.duration);
  const playing = usePlayhead((s) => s.playing);
  const togglePlay = usePlayhead((s) => s.togglePlay);
  const seek = usePlayhead((s) => s.seek);

  // Local drag value avoids per-mousemove store writes.
  const [drag, setDrag] = useState<number | null>(null);
  const display = drag ?? t;

  return (
    <div className="flex h-10 items-center gap-3 border-t border-border bg-background px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{playing ? "Pause" : "Play"}</TooltipContent>
      </Tooltip>

      <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatTime(display)}
      </span>

      <Slider
        className="flex-1"
        value={[display]}
        min={0}
        max={Math.max(duration, 0.1)}
        step={0.05}
        onValueChange={(v) => setDrag(v[0] ?? 0)}
        onValueCommit={(v) => {
          seek(v[0] ?? 0);
          setDrag(null);
        }}
        aria-label="Scrub"
      />

      <span className="w-10 font-mono text-xs tabular-nums text-muted-foreground">
        {formatTime(duration)}
      </span>
    </div>
  );
}
