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
    setUrl(null);
    if (!ref) return;

    let active = true;
    let createdUrl: string | null = null;

    void getAsset(ref)
      .then((asset) => {
        if (!active || !asset) return;
        createdUrl = URL.createObjectURL(asset.blob);
        // Double-check active after async — component may have unmounted
        // during the IndexedDB read. Revoke immediately if so.
        if (!active) {
          URL.revokeObjectURL(createdUrl);
          createdUrl = null;
          return;
        }
        setUrl(createdUrl);
      })
      .catch(() => {
        // IndexedDB read failed (quota, corrupted data, etc.)
        if (active) setUrl(null);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [ref]);

  return url;
}
