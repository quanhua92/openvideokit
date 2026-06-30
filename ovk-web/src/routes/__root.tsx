import { createRootRoute, useParams } from "@tanstack/react-router";

import { AppShell } from "@/app/layout/AppShell";
import { QueryProvider } from "@/app/providers/QueryProvider";
import { RendererProvider } from "@/app/providers/RendererProvider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EditBusProvider } from "@/shared/edit/EditBusProvider";

import "../styles.css";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	// projectId is present only on /projects/$projectId* routes. The EditBus
	// is project-scoped; when no project is active, dispatch no-ops on cache
	// miss. Mounting the provider here lets AppShell (header undo/redo) and
	// the editor subtree share one bus.
	const params = useParams({ strict: false });
	const projectId = params.projectId as string | undefined;

	return (
		<QueryProvider>
			<EditBusProvider projectId={projectId}>
				<RendererProvider>
					<TooltipProvider delayDuration={200}>
						<AppShell />
						<Toaster />
					</TooltipProvider>
				</RendererProvider>
			</EditBusProvider>
		</QueryProvider>
	);
}
