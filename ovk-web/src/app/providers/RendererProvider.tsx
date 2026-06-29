/**
 * RendererProvider — DI seam for the SlideRenderer interface (RFC §9).
 *
 * P0 ships an EMPTY stub. No editor file imports HyperFrames directly;
 * every consumer goes through useSlideRenderer(). P2 swaps in a real HF impl.
 */
import { createContext, type ReactNode, useContext } from "react";

export interface SlideRenderer {
	readonly backend: string;
}

/** P0 stub — replaced by HfRenderer in P2. */
const STUB_RENDERER: SlideRenderer = { backend: "stub-p0" };

const SlideRendererContext = createContext<SlideRenderer>(STUB_RENDERER);

export function RendererProvider({
	value,
	children,
}: {
	value?: SlideRenderer;
	children: ReactNode;
}) {
	return (
		<SlideRendererContext.Provider value={value ?? STUB_RENDERER}>
			{children}
		</SlideRendererContext.Provider>
	);
}

export function useSlideRenderer(): SlideRenderer {
	return useContext(SlideRendererContext);
}
