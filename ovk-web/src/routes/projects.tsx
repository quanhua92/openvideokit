import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for everything under /projects. AppShell lives in __root.tsx so it
 * renders exactly once across the whole route tree.
 */
export const Route = createFileRoute("/projects")({
	component: () => <Outlet />,
});
