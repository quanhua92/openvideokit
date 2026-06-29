/**
 * AppShell — top-level layout wrapping every routed page.
 *
 * P0 ships a minimal shell: logo, project switcher (static), Export button
 * placeholder. P1 fills the rail/stage/etc. via the Studio component.
 */

import { Link, Outlet } from "@tanstack/react-router";
import { ChevronDown, Clapperboard } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FIXTURE_PROJECT_ID } from "@/shared/api/msw/fixtures";

const PROJECT_TO = "/projects/$projectId" as const;
const PROJECT_PARAMS = { projectId: FIXTURE_PROJECT_ID };

export function AppShell({ children }: { children?: ReactNode }) {
	return (
		<div className="flex h-svh flex-col bg-background text-foreground">
			<header className="flex h-12 items-center justify-between border-b border-border px-4">
				<div className="flex items-center gap-2">
					<Clapperboard className="size-5" />
					<span className="text-sm font-semibold">OpenVideoKit</span>
				</div>
				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="sm">
								Eco Bottle Campaign
								<ChevronDown className="size-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Recent projects</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem asChild>
								<Link to={PROJECT_TO} params={PROJECT_PARAMS}>
									Eco Bottle Campaign
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem disabled>More soon…</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<Button size="sm" disabled>
						Export
					</Button>
				</div>
			</header>
			<main className="flex-1 overflow-hidden">{children ?? <Outlet />}</main>
		</div>
	);
}
