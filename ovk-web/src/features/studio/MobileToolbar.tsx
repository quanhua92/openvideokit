/**
 * MobileToolbar — CapCut-style bottom tool picker.
 *
 * Six icon buttons (Props / Timeline / HTML / Assets / Captions / AI).
 * Active tool gets a secondary background; the rest are ghost.
 */
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

import { PANELS, type PanelId } from "./panels";

export function MobileToolbar({
	active,
	onChange,
}: {
	active: PanelId;
	onChange: (id: PanelId) => void;
}) {
	return (
		<nav className="flex h-14 shrink-0 items-stretch gap-1 overflow-x-auto border-t border-border bg-background px-1">
			{PANELS.map((p) => {
				const Icon = p.icon;
				const isActive = p.id === active;
				return (
					<Tooltip key={p.id}>
						<TooltipTrigger asChild>
							<Button
								variant={isActive ? "secondary" : "ghost"}
								onClick={() => onChange(p.id)}
								className="flex h-full min-w-14 shrink-0 flex-col gap-0.5 rounded-none px-1 py-1.5 text-[10px]"
								aria-label={p.label}
								aria-pressed={isActive}
							>
								<Icon className="size-4 shrink-0" />
								<span className="truncate">{p.label}</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">{p.label}</TooltipContent>
					</Tooltip>
				);
			})}
		</nav>
	);
}
