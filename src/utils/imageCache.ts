import { fetch, ResponseType } from "@tauri-apps/api/http";

/**
 * In-memory image cache.
 *
 * Remote image URLs are fetched once via Tauri's HTTP client (bypasses
 * CORS / webview cache quirks), converted to local blob URLs, and then
 * served from memory on all subsequent requests.  This prevents the
 * blank-image flicker that happens when components remount on route
 * changes in the Tauri webview.
 */

/** URL → Object-URL map (persists for the lifetime of the app). */
const cache = new Map<string, string>();

/** URLs currently being fetched (dedup concurrent requests). */
const inflight = new Map<string, Promise<string>>();

/**
 * Return a blob-URL for the given remote image.
 * - First call: fetches via Tauri HTTP, creates a blob URL, caches it.
 * - Subsequent calls: returns the cached blob URL immediately.
 */
export async function getCachedImageUrl(remoteUrl: string): Promise<string> {
    const cached = cache.get(remoteUrl);
    if (cached) return cached;

    // Deduplicate concurrent requests for the same URL
    const existing = inflight.get(remoteUrl);
    if (existing) return existing;

    const promise = (async () => {
        try {
            const response = await fetch<number[]>(remoteUrl, {
                method: "GET",
                responseType: ResponseType.Binary,
            });

            if (!response.ok) {
                // On failure, fall through to the original URL so the
                // browser can attempt to load it directly.
                return remoteUrl;
            }

            const bytes = new Uint8Array(response.data);
            // Determine MIME type from the URL extension
            const ext = remoteUrl.split(".").pop()?.toLowerCase() ?? "";
            let mime = "image/png";
            if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
            else if (ext === "webp") mime = "image/webp";
            else if (ext === "gif") mime = "image/gif";
            else if (ext === "svg") mime = "image/svg+xml";

            const blob = new Blob([bytes], { type: mime });
            const blobUrl = URL.createObjectURL(blob);

            cache.set(remoteUrl, blobUrl);
            return blobUrl;
        } catch {
            // Network error — fall back to raw URL
            return remoteUrl;
        } finally {
            inflight.delete(remoteUrl);
        }
    })();

    inflight.set(remoteUrl, promise);
    return promise;
}

/**
 * Synchronously peek at the cache.  Returns the blob URL if already
 * cached, or `undefined` if the image hasn't been fetched yet.
 */
export function peekCachedImageUrl(remoteUrl: string): string | undefined {
    return cache.get(remoteUrl);
}
