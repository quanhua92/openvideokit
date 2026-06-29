import { createFileRoute } from "@tanstack/react-router";

import { Studio } from "@/features/studio/Studio";

export const Route = createFileRoute("/projects/$projectId/editor")({
	component: EditorRoute,
});

function EditorRoute() {
	const { projectId } = Route.useParams();
	return <Studio projectId={projectId} />;
}
