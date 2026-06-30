/**
 * Studio — responsive entry point.
 *
 * Fetches the project (TanStack Query → MSW → zod), derives the active
 * slide from the playhead, then renders the desktop or mobile layout
 * based on useStudioLayout (live viewport + optional user override).
 *
 * Both layouts receive the same props so panel components are slot-agnostic
 * — only the topology differs.
 */
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cumulativeStarts } from "@/features/timeline/lib/cumulativeStarts";
import { useVoiceover } from "@/features/voiceover/hooks/useVoiceover";
import type { ProjectBundle } from "@/shared/api/client";
import type { ActiveSlide } from "@/shared/api/queries/useActiveSlide";
import { useActiveSlide } from "@/shared/api/queries/useActiveSlide";
import { useProject } from "@/shared/api/queries/useProject";
import { useUndoRedo } from "@/shared/edit/useUndoRedo";
import { useStudioLayout } from "@/shared/lib/useStudioLayout";
import { usePlayhead } from "@/shared/store/playhead";
import { usePlaybackClock } from "@/shared/store/usePlaybackClock";

// Caption base CSS — one file driven by CSS custom properties from the
// caption settings store. CI lint enforces no banned patterns on
// .word--active.
import "@/features/captions/styles/base.css";

import { StudioDesktop } from "./StudioDesktop";
import { StudioMobile } from "./StudioMobile";

export interface StudioData {
	project: ProjectBundle;
	active: ActiveSlide;
	totalDuration: number;
}

const EMPTY_PROJECT: ProjectBundle = {
	root: {
		version: 1,
		canvas: { width: 1920, height: 1080, fps: 30 },
		theme: { caption_style: "highlight", colors: {}, fonts: {} },
		audio: {
			music: { asset: "", volume: 0, loop: false },
			voiceover: { asset: "", auto_generated: false },
		},
		transition_default: { type: "", duration: 0 },
		slides: [],
	},
	slides: {},
	slideHtml: {},
};

export function Studio({ projectId }: { projectId: string }) {
	usePlaybackClock();
	useUndoRedo(projectId);
	const { layout } = useStudioLayout();
	const query = useProject(projectId);
	const { data, isLoading, error } = query;

	// Re-measure slide durations whenever voiceover text changes (debounced).
	useVoiceover(data ?? EMPTY_PROJECT);

	const active = useActiveSlide(data ?? EMPTY_PROJECT);

	// Keep the playhead duration in sync with the project's total so the
	// TransportBar scrubber is bounded correctly.
	const setDuration = usePlayhead((s) => s.setDuration);
	useEffect(() => {
		if (data) {
			const durations = data.root.slides.map(
				(id) => data.slides[id]?.duration ?? 0,
			);
			const { total } = cumulativeStarts(durations);
			if (Math.abs(usePlayhead.getState().duration - total) > 0.01) {
				setDuration(total);
			}
		}
	}, [data, setDuration]);

	if (isLoading) return <StudioSkeleton />;
	if (error instanceof Error)
		return <StudioError message={error.message || "Failed to load project."} />;
	if (!data) return <StudioError message="No project data." />;

	const durations = data.root.slides.map(
		(id) => data.slides[id]?.duration ?? 0,
	);
	const { total } = cumulativeStarts(durations);
	const studioData: StudioData = {
		project: data,
		active,
		totalDuration: total,
	};

	return layout === "desktop" ? (
		<StudioDesktop data={studioData} />
	) : (
		<StudioMobile data={studioData} />
	);
}

function StudioSkeleton() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<div className="w-full max-w-md space-y-2">
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="h-4 w-3/4" />
				<Skeleton className="h-4 w-2/3" />
			</div>
		</div>
	);
}

function StudioError({ message }: { message: string }) {
	return (
		<div className="flex h-full items-center justify-center p-6 text-sm text-destructive">
			{message}
		</div>
	);
}
