/**
 * Studio — responsive entry point.
 *
 * Single component, internal breakpoint switch via useIsDesktop. Both
 * layouts share the same PanelId namespace and (in later phases) the same
 * panel components; only the slot topology differs.
 */
import { useIsDesktop } from "@/shared/lib/useMediaQuery";

import { StudioDesktop } from "./StudioDesktop";
import { StudioMobile } from "./StudioMobile";

export function Studio() {
	const isDesktop = useIsDesktop();
	return isDesktop ? <StudioDesktop /> : <StudioMobile />;
}
