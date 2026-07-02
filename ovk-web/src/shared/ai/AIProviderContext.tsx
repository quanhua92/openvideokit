/**
 * AIProviderContext — DI seam for the AI subsystem.
 *
 * The provider is selected in Settings → AI and stored in localStorage. The
 * only provider is HttpSseProvider (the server-side LangGraph agent); the
 * EchoProvider mock was retired (docs/ai.md §10).
 */
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

import type { AIProvider, ProviderId } from "@/shared/ai/types";

const STORAGE_KEY = "ovk:ai:provider";

interface AIProviderContextValue {
  provider: AIProvider;
  providerId: ProviderId;
  setProviderId: (id: ProviderId) => void;
}

const Ctx = createContext<AIProviderContextValue | null>(null);

export function AIProviderProvider({
  registry,
  children,
}: {
  registry: Map<ProviderId, () => AIProvider>;
  children: ReactNode;
}) {
  const [providerId, setProviderIdState] = useState<ProviderId>(() => {
    if (typeof localStorage === "undefined") return "http";
    const stored = localStorage.getItem(STORAGE_KEY);
    // Validate against known ids so stale localStorage from the retired
    // EchoProvider era doesn't leak an invalid providerId into context.
    const valid: ProviderId[] = ["http"];
    return stored && valid.includes(stored as ProviderId)
      ? (stored as ProviderId)
      : "http";
  });

  const provider = useMemo(() => {
    const factory = registry.get(providerId) ?? registry.get("http");
    if (!factory) throw new Error("no AI provider registered");
    return factory();
  }, [providerId, registry]);

  const setProviderId = (id: ProviderId) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
    setProviderIdState(id);
  };

  return (
    <Ctx.Provider value={{ provider, providerId, setProviderId }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAIProvider(): AIProviderContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useAIProvider must be used inside <AIProviderProvider>");
  }
  return ctx;
}
