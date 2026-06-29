/**
 * useAssetUrl — loads a blob from IndexedDB by SHA-256 ref and returns a
 * blob URL. Returns null while loading or if the asset isn't stored.
 *
 * CRITICAL: resets to null immediately on ref change so a stale blob URL
 * from a previous slide doesn't leak into the next slide.
 */
import { useEffect, useState } from "react";

import { getAsset } from "@/features/assets/lib/assetStore";

export function useAssetUrl(ref: string | undefined | null): string | null {
	const [url, setUrl] = useState<string | null>(null);

	useEffect(() => {
		// Reset IMMEDIATELY so the old slide's image doesn't bleed through.
		setUrl(null);
		if (!ref) return;

		let active = true;
		let createdUrl: string | null = null;

		void getAsset(ref).then((asset) => {
			if (!active || !asset) return;
			createdUrl = URL.createObjectURL(asset.blob);
			setUrl(createdUrl);
		});

		return () => {
			active = false;
			if (createdUrl) URL.revokeObjectURL(createdUrl);
		};
	}, [ref]);

	return url;
}
