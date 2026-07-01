import { createFileRoute } from "@tanstack/react-router";

import { ExportsPage } from "@/features/export/pages/ExportsPage";

export const Route = createFileRoute("/projects/$projectId/exports")({
  component: ExportsPageRoute,
});

function ExportsPageRoute() {
  const { projectId } = Route.useParams();
  return <ExportsPage projectId={projectId} />;
}
