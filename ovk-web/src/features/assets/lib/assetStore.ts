/**
 * Asset store — SHA-256 content-addressed blobs backed by IndexedDB.
 *
 * Uses `js-sha256` (pure JS) so it works in non-secure contexts
 * (e.g. http://192.168.x.x on LAN). `crypto.subtle` requires HTTPS or
 * localhost and would throw on LAN.
 *
 * Dedup is free: same bytes → same hash → same ref → existing entry.
 */
import { del, get, keys, set } from "idb-keyval";
import { sha256 } from "js-sha256";

const PREFIX = "ovk:asset:";

export interface Asset {
	ref: string;
	blob: Blob;
	mime: string;
	size: number;
	createdAt: number;
}

/** Hash a blob → `sha256:<hex>`. Pure JS, no crypto.subtle needed. */
export async function hashBlob(blob: Blob): Promise<string> {
	const buffer = await blob.arrayBuffer();
	const hash = sha256(new Uint8Array(buffer));
	return `sha256:${hash}`;
}

/** Store a blob. Dedupes automatically — same content = same ref. */
export async function storeAsset(blob: Blob): Promise<string> {
	const ref = await hashBlob(blob);
	const existing = await get(PREFIX + ref);
	if (!existing) {
		const asset: Asset = {
			ref,
			blob,
			mime: blob.type || "application/octet-stream",
			size: blob.size,
			createdAt: Date.now(),
		};
		await set(PREFIX + ref, asset);
	}
	return ref;
}

/** Get a single asset by ref. */
export async function getAsset(ref: string): Promise<Asset | undefined> {
	return get(PREFIX + ref);
}

/** List all assets, newest first. */
export async function listAssets(): Promise<Asset[]> {
	const allKeys = await keys();
	const assets: Asset[] = [];
	for (const key of allKeys) {
		if (String(key).startsWith(PREFIX)) {
			const a = await get(key);
			if (a) assets.push(a as Asset);
		}
	}
	return assets.sort((a, b) => b.createdAt - a.createdAt);
}

/** Delete an asset by ref. */
export async function removeAsset(ref: string): Promise<void> {
	await del(PREFIX + ref);
}

/** Count stored assets (for quota awareness). */
export async function countAssets(): Promise<number> {
	const allKeys = await keys();
	return allKeys.filter((k) => String(k).startsWith(PREFIX)).length;
}
