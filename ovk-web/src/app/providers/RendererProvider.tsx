/**
 * RendererProvider — DI seam for the SlideRenderer interface (RFC §9).
 *
 * P2 wires a MockRenderer that satisfies the contract without pulling in
 * HyperFrames. P6+ swaps in a real HF impl behind the same interface.
 */
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { MockRenderer } from "@/shared/renderer/MockRenderer";

import type { SlideRenderer } from "@/shared/renderer/types";

const SlideRendererContext = createContext<SlideRenderer | null>(null);

export function RendererProvider({ children }: { children: ReactNode }) {
  const renderer = useMemo(() => new MockRenderer(), []);
  return (
    <SlideRendererContext.Provider value={renderer}>
      {children}
    </SlideRendererContext.Provider>
  );
}

export function useSlideRenderer(): SlideRenderer {
  const renderer = useContext(SlideRendererContext);
  if (!renderer) {
    throw new Error("useSlideRenderer must be used inside <RendererProvider>");
  }
  return renderer;
}
