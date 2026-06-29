import { createFileRoute } from "@tanstack/react-router";

import { Studio } from "@/features/studio/Studio";
import { EditBusProvider } from "@/shared/edit/EditBusProvider";

export const Route = createFileRoute("/projects/$projectId/editor")({
	component: EditorRoute,
});

function EditorRoute() {
	const { projectId } = Route.useParams();
	return (
		<EditBusProvider projectId={projectId}>
			<Studio projectId={projectId} />
		</EditBusProvider>
	);
}
