/**
 * StudioDesktop — 4-zone layout for ≥1024px (or forced via Settings).
 *
 *   ┌─────┬───────────────┬────────────┐
 *   │ Rail│   Stage       │ Right Tabs │
 *   │     │  (StageCanvas)│  Props     │
 *   │  ◧  │               │  HTML      │
 *   │  ⌨  │               │  Captions  │
 *   │  💬 │               │  AI        │
 *   │  🖼  ├───────────────┤            │
 *   │  ✨ │  Transport    │            │
 *   │     ├───────────────┤            │
 *   │     │  Timeline     │            │
 *   └─────┴───────────────┴────────────┘
 */
import { Images } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { AIDock } from "@/features/ai/AIDock";
import { AssetLibrary } from "@/features/assets/components/AssetLibrary";
import { CaptionControls } from "@/features/captions/components/CaptionControls";
import { CaptionTextEditor } from "@/features/captions/components/CaptionTextEditor";
import { HtmlEditor } from "@/features/html-editor/HtmlEditor";
import { PropertiesPanel } from "@/features/properties/PropertiesPanel";
import { StageCanvas } from "@/features/stage/StageCanvas";
import { TimelinePanel } from "@/features/timeline/TimelinePanel";
import { EmptySlot } from "./EmptySlot";
import { getPanel, PANELS, type PanelDescriptor, type PanelId } from "./panels";
import type { StudioData } from "./Studio";
import { TransportBar } from "./TransportBar";

const RIGHT_TAB_PANELS = PANELS.filter((p) =>
	["props", "html", "captions", "ai"].includes(p.id),
);

export function StudioDesktop({ data }: { data: StudioData }) {
	const [activeTab, setActiveTab] = useState<PanelId>("ai");
	const [assetsOpen, setAssetsOpen] = useState(false);
	const { project, active, totalDuration } = data;

	return (
		<div className="flex h-full flex-col">
			<ResizablePanelGroup direction="horizontal" autoSaveId="ovk-horizontal">
				<ResizablePanel
					defaultSize={8}
					minSize={5}
					maxSize={15}
					className="flex flex-col items-center gap-1 border-r border-border bg-muted/30 py-2"
				>
					<RailButton
						panel={getPanel("ai")}
						active={activeTab === "ai"}
						onClick={() => setActiveTab("ai")}
					/>
					<RailButton
						panel={getPanel("props")}
						active={activeTab === "props"}
						onClick={() => setActiveTab("props")}
					/>
					<RailButton
						panel={getPanel("captions")}
						active={activeTab === "captions"}
						onClick={() => setActiveTab("captions")}
					/>
					<RailButton
						panel={getPanel("html")}
						active={activeTab === "html"}
						onClick={() => setActiveTab("html")}
					/>
					<div className="my-1 h-px w-6 bg-border" />
					<RailButton
						panel={getPanel("assets")}
						active={assetsOpen}
						onClick={() => setAssetsOpen(true)}
					/>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel defaultSize={62}>
					<ResizablePanelGroup direction="vertical" autoSaveId="ovk-vertical">
						<ResizablePanel defaultSize={70} minSize={30}>
							<StageCanvas
								slide={active.slide}
								localTime={active.localTime}
								activeStart={active.start}
								captionStyle={project.root.theme.caption_style}
							/>
						</ResizablePanel>
						<ResizableHandle />
						<ResizablePanel defaultSize={3} minSize={3} maxSize={5}>
							<TransportBar />
						</ResizablePanel>
						<ResizableHandle />
						<ResizablePanel defaultSize={27} minSize={10}>
							<TimelinePanel project={project} />
						</ResizablePanel>
					</ResizablePanelGroup>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
					<Tabs
						value={activeTab}
						onValueChange={(v) => setActiveTab(v as PanelId)}
						className="flex h-full flex-col"
					>
						<TabsList className="m-2 grid w-auto grid-cols-4">
							{RIGHT_TAB_PANELS.map((p) => (
								<TabsTrigger key={p.id} value={p.id}>
									<p.icon className="size-3.5" />
									<span className="ml-1 hidden xl:inline">{p.label}</span>
								</TabsTrigger>
							))}
						</TabsList>
						<TabsContent
							value="ai"
							className="m-0 min-h-0 flex-1 overflow-hidden"
						>
							<AIDock slideId={active.slideId} />
						</TabsContent>
						<TabsContent
							value="props"
							className="m-0 min-h-0 flex-1 overflow-hidden"
						>
							<PropertiesPanel slide={active.slide} slideId={active.slideId} />
						</TabsContent>
						<TabsContent
							value="captions"
							className="m-0 min-h-0 flex-1 overflow-hidden"
						>
							<CaptionsPanel slide={active.slide} slideId={active.slideId} />
						</TabsContent>
						<TabsContent
							value="html"
							className="m-0 min-h-0 flex-1 overflow-hidden"
						>
							{active.slideId ? (
								<HtmlEditor
									key={active.slideId}
									slideId={active.slideId}
									prior={project.slideHtml[active.slideId] ?? ""}
								/>
							) : (
								<EmptySlot panel={getPanel("html")} />
							)}
						</TabsContent>
					</Tabs>
				</ResizablePanel>
			</ResizablePanelGroup>

			<AssetsDialog
				open={assetsOpen}
				onOpenChange={setAssetsOpen}
				slideId={active.slideId ?? "slide-0"}
			/>
			{/* Total duration surfaced for parity with mobile; unused at runtime. */}
			<input type="hidden" value={totalDuration} readOnly />
		</div>
	);
}

function RailButton({
	panel,
	active,
	onClick,
}: {
	panel: PanelDescriptor;
	active: boolean;
	onClick: () => void;
}) {
	const Icon = panel.icon;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant={active ? "secondary" : "ghost"}
					size="icon"
					onClick={onClick}
					aria-label={panel.label}
					aria-pressed={active}
				>
					<Icon className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right">{panel.label}</TooltipContent>
		</Tooltip>
	);
}

function AssetsDialog({
	open,
	onOpenChange,
	slideId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	slideId: string;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						<span className="flex items-center gap-2">
							<Images className="size-4" />
							Assets
						</span>
					</DialogTitle>
				</DialogHeader>
				<div className="h-[60vh]">
					<AssetLibrary slideId={slideId} />
				</div>
			</DialogContent>
		</Dialog>
	);
}

function CaptionsPanel({
	slide,
	slideId,
}: {
	slide: import("@/shared/api/schemas/slideIndex").SlideIndex | null;
	slideId: string | null;
}) {
	if (!slide || !slideId) {
		return (
			<div className="flex h-full items-center justify-center text-xs text-muted-foreground">
				No active slide.
			</div>
		);
	}
	return (
		<div className="flex h-full flex-col">
			<header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Captions
				</h2>
			</header>
			<div className="flex-1 min-h-0 overflow-y-auto">
				<div className="space-y-4 p-4">
					<CaptionTextEditor slide={slide} slideId={slideId} />
					<CaptionControls />
				</div>
			</div>
		</div>
	);
}
