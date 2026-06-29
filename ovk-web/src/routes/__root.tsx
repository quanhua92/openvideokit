import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { AppShell } from "@/app/layout/AppShell";
import { QueryProvider } from "@/app/providers/QueryProvider";
import { RendererProvider } from "@/app/providers/RendererProvider";
import { Toaster } from "@/components/ui/sonner";

import "../styles.css";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<QueryProvider>
			<RendererProvider>
				<AppShell />
				<Toaster />
				<TanStackDevtools
					config={{ position: "bottom-right" }}
					plugins={[
						{
							name: "TanStack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
			</RendererProvider>
		</QueryProvider>
	);
}
