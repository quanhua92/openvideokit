import { createRootRoute } from "@tanstack/react-router";

import { AppShell } from "@/app/layout/AppShell";
import { QueryProvider } from "@/app/providers/QueryProvider";
import { RendererProvider } from "@/app/providers/RendererProvider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "../styles.css";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<QueryProvider>
			<RendererProvider>
				<TooltipProvider delayDuration={200}>
					<AppShell />
					<Toaster />
				</TooltipProvider>
			</RendererProvider>
		</QueryProvider>
	);
}
