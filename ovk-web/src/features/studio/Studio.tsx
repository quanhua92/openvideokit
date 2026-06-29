/**
 * Studio — responsive entry point.
 *
 * Single component, internal breakpoint switch via useStudioLayout. The
 * effective layout combines the live viewport with an optional user
 * override (default | desktop | mobile) so the studio can be forced into
 * either mode for testing. Both layouts share the same PanelId namespace
 * and (in later phases) the same panel components; only the slot topology
 * differs.
 */
import { useStudioLayout } from "@/shared/lib/useStudioLayout";

import { StudioDesktop } from "./StudioDesktop";
import { StudioMobile } from "./StudioMobile";

export function Studio() {
	const { layout } = useStudioLayout();
	return layout === "desktop" ? <StudioDesktop /> : <StudioMobile />;
}
