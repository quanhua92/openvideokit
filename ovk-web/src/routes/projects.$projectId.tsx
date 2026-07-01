import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for /projects/:id. Renders Outlet for child routes (index, /editor).
 * No AppShell here — it lives in __root.tsx.
 */
export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectLayout,
});

function ProjectLayout() {
  return <Outlet />;
}
