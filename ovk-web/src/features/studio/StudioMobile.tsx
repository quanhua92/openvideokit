/**
 * StudioMobile — CapCut-style layout for <1024px.
 *
 *   ┌──────────────────────┐
 *   │       Stage          │  ← ~45vh
 *   ├──────────────────────┤
 *   │      Transport       │  ← h-10
 *   ├──────────────────────┤
 *   │      (panel)         │  ← flex-1, shows active tool content
 *   ├──────────────────────┤
 *   │  ⚙ ⏻ 🖼 💬 ⌨ ✨      │  ← h-14 bottom toolbar
 *   └──────────────────────┘
 *
 * One tool active at a time. Tapping a tool button shows its EmptySlot in
 * the panel area (no Sheet for P1 — content fits inline; Sheet variant
 * reserved for P2+ when content gets taller).
 */
import { useState } from "react";

import { EmptySlot } from "./EmptySlot";
import { MobileToolbar } from "./MobileToolbar";
import { PANELS, type PanelId } from "./panels";
import { TransportBar } from "./TransportBar";

export function StudioMobile() {
	const [active, setActive] = useState<PanelId>("props");
	const panel = PANELS.find((p) => p.id === active) ?? PANELS[0];

	return (
		<div className="flex h-full flex-col">
			<div className="relative h-[45vh] min-h-48 shrink-0 bg-neutral-100 dark:bg-neutral-900">
				<StagePlaceholder />
			</div>
			<TransportBar />
			<div className="flex-1 overflow-hidden border-t border-border">
				<EmptySlot panel={panel} />
			</div>
			<MobileToolbar active={active} onChange={setActive} />
		</div>
	);
}

function StagePlaceholder() {
	return (
		<div className="flex h-full items-center justify-center">
			<div className="text-center">
				<p className="text-sm font-semibold">Stage</p>
				<p className="mt-1 text-xs text-muted-foreground">
					HF renderer wires in P2.
				</p>
			</div>
		</div>
	);
}
