import { tauriFetchText } from "@app/utils/tauriFetch";
import { useQuery } from "@tanstack/react-query";
import { type } from "@tauri-apps/api/os";
import { getS2ChannelChangelogUrl, getS2ChangelogUrl, ReleaseChannels, useS2Release } from "./useS2Release";

/**
 * Returns true if the response looks like a valid plaintext changelog
 * rather than an HTML page (the masterserver redirects missing files
 * to its root page with a 200 instead of returning a 404).
 */
function isValidChangelog(text: string): boolean {
    const trimmed = text.trimStart();
    return !trimmed.startsWith("<!") && !trimmed.startsWith("<html") && !trimmed.startsWith("<HTML");
}

export const useChangelog = (channel: ReleaseChannels) => {
    const { data: releaseData } = useS2Release(channel);

    return useQuery({
        queryKey: ["Changelog", channel],
        gcTime: 10 * 60 * 1000,
        queryFn: async (): Promise<string> => {
            const platformType = await type();

            // Try the channel-specific changelog first (e.g. .../latest/change_log.txt)
            const channelUrl = getS2ChannelChangelogUrl(releaseData, platformType);
            try {
                const text = await tauriFetchText(channelUrl);
                if (isValidChangelog(text)) return text;
            } catch {
                // Fall back to the OS-wide default changelog
            }

            const fallbackUrl = getS2ChangelogUrl(releaseData, platformType);
            const text = await tauriFetchText(fallbackUrl);
            if (!isValidChangelog(text)) {
                throw new Error("Changelog not available");
            }
            return text;
        }
    });
};
