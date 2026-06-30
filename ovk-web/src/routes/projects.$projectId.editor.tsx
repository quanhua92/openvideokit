import { createFileRoute } from "@tanstack/react-router";

import { Studio } from "@/features/studio/Studio";

export const Route = createFileRoute("/projects/$projectId/editor")({
	component: EditorRoute,
});

function EditorRoute() {
	const { projectId } = Route.useParams();
	// EditBusProvider is mounted at the root (__root.tsx) so the AppShell
	// header shares the same bus for undo/redo. projectId flows in from the
	// route param via useParams there.
	return <Studio projectId={projectId} />;
}
