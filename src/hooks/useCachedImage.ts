import { useState, useEffect } from "react";
import { getCachedImageUrl, peekCachedImageUrl } from "@app/utils/imageCache";

export interface CachedImageResult {
    src: string | undefined;
    isLoading: boolean;
}

/**
 * React hook that returns a cached blob URL for a remote image.
 *
 * On the very first render, if the image is already cached, the blob
 * URL is returned synchronously (no flash).  Otherwise a fetch is
 * kicked off and the returned URL updates from `fallback` → blob URL
 * once it's ready.
 *
 * @param remoteUrl   - The remote HTTPS image URL (or null to skip).
 * @param fallback    - URL to show while the image is loading (optional).
 * @returns Object with `src` (the resolved URL) and `isLoading` flag.
 */
export function useCachedImage(
    remoteUrl: string | null | undefined,
    fallback?: string,
): CachedImageResult {
    // Try synchronous cache hit first (avoids any flash at all)
    const immediate = remoteUrl ? peekCachedImageUrl(remoteUrl) : undefined;
    const [src, setSrc] = useState<string | undefined>(immediate);
    const [isLoading, setIsLoading] = useState(!immediate && !!remoteUrl);

    useEffect(() => {
        if (!remoteUrl) {
            setSrc(undefined);
            setIsLoading(false);
            return;
        }

        // Already have it from the synchronous peek
        const peeked = peekCachedImageUrl(remoteUrl);
        if (peeked) {
            setSrc(peeked);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        let cancelled = false;
        getCachedImageUrl(remoteUrl).then((url) => {
            if (!cancelled) {
                setSrc(url);
                setIsLoading(false);
            }
        });

        return () => { cancelled = true; };
    }, [remoteUrl]);

    return {
        src: src ?? fallback ?? (remoteUrl ?? undefined),
        isLoading,
    };
}
