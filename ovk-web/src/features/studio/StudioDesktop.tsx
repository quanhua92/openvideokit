/**
 * StudioDesktop — 4-zone layout for ≥1024px.
 *
 *   ┌─────┬───────────────┬────────────┐
 *   │ Rail│   Stage       │ Right Tabs │
 *   │     │               │  Props     │
 *   │  ◧  │               │  HTML      │
 *   │  ⌨  │               │  Captions  │
 *   │  💬 │               │  AI        │
 *   │  🖼  ├───────────────┤            │
 *   │  ✨ │  Transport    │            │
 *   │     ├───────────────┤            │
 *   │     │  Timeline     │            │
 *   └─────┴───────────────┴────────────┘
 *
 * Rail: icon-only nav; clicking a panel icon either switches the right
 * Tabs (props/html/captions/ai) or opens a Dialog (assets).
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

import { EmptySlot } from "./EmptySlot";
import { getPanel, PANELS, type PanelDescriptor, type PanelId } from "./panels";
import { TransportBar } from "./TransportBar";

const RIGHT_TAB_PANELS = PANELS.filter((p) =>
	["props", "html", "captions", "ai"].includes(p.id),
);

export function StudioDesktop() {
	const [activeTab, setActiveTab] = useState<PanelId>("props");
	const [assetsOpen, setAssetsOpen] = useState(false);

	return (
		<div className="flex h-full flex-col">
			<ResizablePanelGroup direction="horizontal" autoSaveId="ovk-horizontal">
				{/* Rail */}
				<ResizablePanel
					defaultSize={8}
					minSize={5}
					maxSize={15}
					className="flex flex-col items-center gap-1 border-r border-border bg-muted/30 py-2"
				>
					<RailButton
						panel={getPanel("props")}
						active={activeTab === "props"}
						onClick={() => setActiveTab("props")}
					/>
					<RailButton
						panel={getPanel("html")}
						active={activeTab === "html"}
						onClick={() => setActiveTab("html")}
					/>
					<RailButton
						panel={getPanel("captions")}
						active={activeTab === "captions"}
						onClick={() => setActiveTab("captions")}
					/>
					<RailButton
						panel={getPanel("ai")}
						active={activeTab === "ai"}
						onClick={() => setActiveTab("ai")}
					/>
					<div className="my-1 h-px w-6 bg-border" />
					<RailButton
						panel={getPanel("assets")}
						active={assetsOpen}
						onClick={() => setAssetsOpen(true)}
					/>
				</ResizablePanel>

				<ResizableHandle />

				{/* Middle: stage + transport + timeline (vertical) */}
				<ResizablePanel defaultSize={62}>
					<ResizablePanelGroup direction="vertical" autoSaveId="ovk-vertical">
						<ResizablePanel defaultSize={70} minSize={30}>
							<StagePlaceholder />
						</ResizablePanel>
						<ResizableHandle />
						<ResizablePanel defaultSize={3} minSize={3} maxSize={5}>
							<TransportBar />
						</ResizablePanel>
						<ResizableHandle />
						<ResizablePanel defaultSize={27} minSize={10}>
							<EmptySlot panel={getPanel("timeline")} />
						</ResizablePanel>
					</ResizablePanelGroup>
				</ResizablePanel>

				<ResizableHandle />

				{/* Right: Tabs (Props / HTML / Captions / AI) */}
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
						{RIGHT_TAB_PANELS.map((p) => (
							<TabsContent key={p.id} value={p.id} className="m-0 flex-1">
								<EmptySlot panel={p} />
							</TabsContent>
						))}
					</Tabs>
				</ResizablePanel>
			</ResizablePanelGroup>

			<AssetsDialog open={assetsOpen} onOpenChange={setAssetsOpen} />
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

function StagePlaceholder() {
	return (
		<div className="flex h-full items-center justify-center bg-neutral-100 dark:bg-neutral-900">
			<div className="text-center">
				<p className="text-sm font-semibold">Stage</p>
				<p className="mt-1 text-xs text-muted-foreground">
					HF renderer wires in P2.
				</p>
			</div>
		</div>
	);
}

function AssetsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
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
				<EmptySlot panel={getPanel("assets")} />
			</DialogContent>
		</Dialog>
	);
}
