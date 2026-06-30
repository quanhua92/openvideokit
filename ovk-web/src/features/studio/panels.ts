/**
 * Panel identifiers — the six first-class editor surfaces.
 * Reserved from P1 so later phases plug into the same slots.
 */
import {
	Braces,
	Clapperboard,
	Images,
	LayoutPanelLeft,
	MessageSquare,
	Settings2,
	Sparkles,
} from "lucide-react";

export type PanelId =
	| "props"
	| "timeline"
	| "html"
	| "assets"
	| "captions"
	| "ai"
	| "project";

export interface PanelDescriptor {
	id: PanelId;
	label: string;
	/** lucide icon component */
	icon: React.ComponentType<{ className?: string }>;
	/** Notes the phase that fills this slot with real content. */
	landsIn: string;
}

export const PANELS: ReadonlyArray<PanelDescriptor> = [
	{ id: "ai", label: "AI", icon: Sparkles, landsIn: "P6" },
	{ id: "props", label: "Props", icon: LayoutPanelLeft, landsIn: "P3" },
	{ id: "timeline", label: "Timeline", icon: Clapperboard, landsIn: "P3" },
	{ id: "captions", label: "Captions", icon: MessageSquare, landsIn: "P4" },
	{ id: "html", label: "HTML", icon: Braces, landsIn: "P5" },
	{ id: "assets", label: "Assets", icon: Images, landsIn: "P7" },
	{ id: "project", label: "Project", icon: Settings2, landsIn: "P3" },
];

/** Look up a panel by id. Throws at module load if the PANELS table is missing an entry. */
export function getPanel(id: PanelId): PanelDescriptor {
	const found = PANELS.find((p) => p.id === id);
	if (!found) throw new Error(`unknown panel id: ${id}`);
	return found;
}
