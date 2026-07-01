/**
 * AIProviderContext — DI seam for the AI subsystem.
 *
 * P6 ships EchoProvider (mock, keyword-routed) + stubs for real providers.
 * The provider is selected in Settings → AI and stored in localStorage.
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
    if (typeof localStorage === "undefined") return "echo";
    return (localStorage.getItem(STORAGE_KEY) as ProviderId) ?? "echo";
  });

  const provider = useMemo(() => {
    const factory = registry.get(providerId) ?? registry.get("echo");
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
