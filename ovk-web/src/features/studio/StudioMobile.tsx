/**
 * StudioMobile — CapCut-style layout.
 *
 *   ┌──────────────────────┐
 *   │       Stage       ⌃  │  ← ~45vh, collapse button top-right
 *   ├──────────────────────┤
 *   │      Transport       │  ← h-10
 *   ├──────────────────────┤
 *   │      (active panel)  │  ← flex-1 — gets the stage's space when hidden
 *   ├──────────────────────┤
 *   │  ✨ ◧ 💬 ⌨ 🖼 ⏻     │  ← h-14 toolbar
 *   └──────────────────────┘
 *
 * Tap the chevron on the stage to collapse it; the panel below expands to
 * fill the freed space. Tap "Show stage" to bring it back.
 */

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AIDock } from "@/features/ai/AIDock";
import { PropertiesPanel } from "@/features/properties/PropertiesPanel";
import { StageCanvas } from "@/features/stage/StageCanvas";
import { TimelinePanel } from "@/features/timeline/TimelinePanel";
import { EmptySlot } from "./EmptySlot";
import { MobileToolbar } from "./MobileToolbar";
import { getPanel, type PanelId } from "./panels";
import type { StudioData } from "./Studio";
import { TransportBar } from "./TransportBar";

export function StudioMobile({ data }: { data: StudioData }) {
	const [active, setActive] = useState<PanelId>("ai");
	const [stageHidden, setStageHidden] = useState(false);
	const { project, active: activeSlide } = data;

	return (
		<div className="flex h-full flex-col">
			{stageHidden ? (
				<button
					type="button"
					onClick={() => setStageHidden(false)}
					className="flex h-8 shrink-0 items-center justify-center gap-1.5 border-b border-border bg-muted/40 text-xs text-muted-foreground hover:bg-muted"
					aria-label="Show stage"
				>
					<ChevronDown className="size-3" />
					Show stage
				</button>
			) : (
				<div className="relative h-[30vh] min-h-36 shrink-0">
					<StageCanvas
						slide={activeSlide.slide}
						localTime={activeSlide.localTime}
					/>
					<Button
						variant="secondary"
						size="icon"
						className="absolute right-2 top-2 size-7 opacity-90"
						onClick={() => setStageHidden(true)}
						aria-label="Hide stage"
					>
						<ChevronUp className="size-3.5" />
					</Button>
				</div>
			)}

			<TransportBar />

			<div className="flex-1 overflow-hidden border-t border-border">
				{active === "props" && (
					<PropertiesPanel
						slide={activeSlide.slide}
						slideId={activeSlide.slideId}
					/>
				)}
				{active === "timeline" && <TimelinePanel project={project} />}
				{active === "html" && <EmptySlot panel={getPanel("html")} />}
				{active === "assets" && <EmptySlot panel={getPanel("assets")} />}
				{active === "captions" && <EmptySlot panel={getPanel("captions")} />}
				{active === "ai" && <AIDock slideId={activeSlide.slideId} />}
			</div>

			<MobileToolbar active={active} onChange={setActive} />
		</div>
	);
}
