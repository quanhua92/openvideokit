/**
 * QueryProvider — TanStack Query client for server state.
 *
 * Mounted once in __root.tsx. All later phases consume useQuery / useMutation
 * against this client.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
	const [client] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 60_000,
						refetchOnWindowFocus: false,
						retry: 1,
					},
				},
			}),
	);

	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
