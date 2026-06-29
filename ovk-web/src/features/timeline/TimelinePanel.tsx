/**
 * TimelinePanel — read-only view over (root.slides + per-slide durations).
 *
 * P3 adds drag-reorder, add/remove slide. P2 just renders the clips + audio
 * lane + playhead line.
 */

import type { ProjectBundle } from "@/shared/api/client";
import { usePlayhead } from "@/shared/store/playhead";
import { cumulativeStarts } from "./lib/cumulativeStarts";

const PX_PER_SEC = 24;

export function TimelinePanel({ project }: { project: ProjectBundle }) {
	const t = usePlayhead((s) => s.t);
	const ids = project.root.slides;
	const durations = ids.map((id) => project.slides[id]?.duration ?? 0);
	const { starts, total } = cumulativeStarts(durations);

	const playheadX = t * PX_PER_SEC;
	const totalWidth = Math.max(total * PX_PER_SEC + 80, 600);

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b border-border px-4 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Timeline
				</h2>
				<span className="font-mono text-xs text-muted-foreground">
					{t.toFixed(1)}s / {total.toFixed(1)}s
				</span>
			</div>
			<div className="relative flex-1 overflow-x-auto">
				<div
					className="relative h-full min-w-full"
					style={{ width: totalWidth }}
				>
					<SlideLane
						ids={ids}
						durations={durations}
						starts={starts}
						project={project}
						playheadX={playheadX}
					/>
				</div>
			</div>
		</div>
	);
}

function SlideLane({
	ids,
	durations,
	starts,
	project,
	playheadX,
}: {
	ids: string[];
	durations: number[];
	starts: number[];
	project: ProjectBundle;
	playheadX: number;
}) {
	return (
		<div className="absolute inset-0 px-2 py-3">
			{/* Clips */}
			<div className="relative flex h-12 gap-1">
				{ids.map((id, i) => {
					const slide = project.slides[id];
					const width = durations[i] * PX_PER_SEC;
					const left = starts[i] * PX_PER_SEC;
					return (
						<div
							key={id}
							className="absolute top-0 flex h-12 flex-col justify-center rounded-md border border-border bg-card px-3"
							style={{ width: width - 4, left }}
						>
							<span className="truncate text-xs font-medium">
								{slide?.fields.title ?? id}
							</span>
							<span className="font-mono text-[10px] text-muted-foreground">
								{durations[i].toFixed(1)}s
							</span>
						</div>
					);
				})}
			</div>

			{/* Audio lane */}
			<div className="relative mt-2 h-6 rounded-md bg-muted/40">
				<div
					className="absolute inset-y-0 left-0 rounded-md bg-primary/15"
					style={{ width: totalLaneWidth(durations, PX_PER_SEC) }}
				/>
				<span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
					music · voiceover
				</span>
			</div>

			{/* Playhead line */}
			<div
				className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary"
				style={{ left: playheadX + 8 }}
			>
				<div className="absolute -top-1 -left-1.5 size-3 rounded-full bg-primary" />
			</div>
		</div>
	);
}

function totalLaneWidth(durations: number[], pxPerSec: number): number {
	return durations.reduce((sum, d) => sum + d, 0) * pxPerSec;
}
