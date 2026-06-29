/**
 * AppShell — top-level layout wrapping every routed page.
 *
 * Header: logo + single overflow menu. Same on every breakpoint.
 *
 * Overflow menu contains:
 *   - Recent projects (link to overview)
 *   - Export (opens ExportDialog)
 *   - Theme submenu (Light / Dark / System) — quick access
 *   - Settings link (full preferences page)
 */

import { Link, Outlet } from "@tanstack/react-router";
import { Clapperboard, MoreHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExportDialog } from "@/features/export/components/ExportDialog";
import { FIXTURE_PROJECT_ID } from "@/shared/api/msw/fixtures";
import type { Theme } from "@/shared/lib/theme";
import { useTheme } from "@/shared/lib/useTheme";

const PROJECT_TO = "/projects/$projectId" as const;
const PROJECT_PARAMS = { projectId: FIXTURE_PROJECT_ID };

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
	{ value: "system", label: "System" },
];

export function AppShell({ children }: { children?: ReactNode }) {
	const [exportOpen, setExportOpen] = useState(false);

	return (
		<div className="flex h-svh flex-col bg-background text-foreground">
			<header className="flex h-12 items-center justify-between border-b border-border px-4">
				<div className="flex items-center gap-2">
					<Clapperboard className="size-5" />
					<span className="text-sm font-semibold">OpenVideoKit</span>
				</div>
				<OverflowMenu onExport={() => setExportOpen(true)} />
			</header>
			<main className="flex-1 overflow-hidden">{children ?? <Outlet />}</main>
			<ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
		</div>
	);
}

function OverflowMenu({ onExport }: { onExport: () => void }) {
	const { theme, setTheme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="Menu">
					<MoreHorizontal className="size-5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuLabel>Recent projects</DropdownMenuLabel>
				<DropdownMenuItem asChild>
					<Link to={PROJECT_TO} params={PROJECT_PARAMS}>
						Eco Bottle Campaign
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem disabled>More soon…</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onExport} className="cursor-pointer">
					Export
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<span className="capitalize">{theme}</span>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						{THEME_OPTIONS.map(({ value, label }) => (
							<DropdownMenuItem
								key={value}
								onClick={() => setTheme(value)}
								className={theme === value ? "font-medium" : ""}
							>
								{label}
							</DropdownMenuItem>
						))}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuItem asChild>
					<Link to="/settings">Settings</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
