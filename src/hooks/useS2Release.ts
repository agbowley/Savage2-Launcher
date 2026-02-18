import { OsType } from "@tauri-apps/api/os";

export type ReleaseChannels = "stable" | "nightly" | "legacy";

type ReleaseAsset = {
    name: string;
    download_url: string;
};

type ReleaseData = {
    tag_name: string;
    name: string;
    description: string;
    created_at: string;
    assets: ReleaseAsset[];
};

export type ExtendedReleaseData = ReleaseData & {
    channel: ReleaseChannels;
};

const DOWNLOAD_BASE = "https://masterserver1.talesofnewerth.com";

/**
 * Static release definitions for each channel.
 * Download URLs will transition to /latest/ paths in the future.
 */
const releaseDefinitions: Record<ReleaseChannels, ReleaseData> = {
    stable: {
        tag_name: "2.2.0",
        name: "Savage 2 - Community Edition",
        description: "The official live release of Savage 2: A Tortured Soul – Community Edition. 64-bit client with improved stability, performance, and quality-of-life improvements.",
        created_at: "2025-11-28T02:40:40",
        assets: [
            {
                name: "Savage2CEInstall.exe",
                download_url: `${DOWNLOAD_BASE}/wb6/i686/2.2.0/Savage2CEInstall.exe`,
            },
            {
                name: "sav2_2.2.0.0_release_aamd64.tar.gz",
                download_url: `${DOWNLOAD_BASE}/lr1/x86_64/2.2.0/sav2_2.2.0.0_release_aamd64.tar.gz`,
            },
        ],
    },
    legacy: {
        tag_name: "legacy",
        name: "Savage 2 - Legacy Client",
        description: "The legacy version of Savage 2 for players who prefer the original client.",
        created_at: "2023-03-09T05:00:00",
        assets: [
            {
                name: "Savage2CEInstall.exe",
                download_url: `${DOWNLOAD_BASE}/wb6/i686/2.2.0/Savage2CEInstall.exe`,
            },
            {
                name: "sav2_2.2.0.0_release_aamd64.tar.gz",
                download_url: `${DOWNLOAD_BASE}/lr1/x86_64/2.2.0/sav2_2.2.0.0_release_aamd64.tar.gz`,
            },
        ],
    },
    nightly: {
        tag_name: "beta",
        name: "Savage 2 - Beta Test Client",
        description: "The beta test client for upcoming features and patches. Use this to help test changes before they go live.",
        created_at: "2025-11-28T02:40:40",
        assets: [
            {
                name: "Savage2CEInstall.exe",
                download_url: `${DOWNLOAD_BASE}/wb6/i686/2.2.0/Savage2CEInstall.exe`,
            },
            {
                name: "sav2_2.2.0.0_release_aamd64.tar.gz",
                download_url: `${DOWNLOAD_BASE}/lr1/x86_64/2.2.0/sav2_2.2.0.0_release_aamd64.tar.gz`,
            },
        ],
    },
};

/**
 * Returns release data for the given channel.
 * This is no longer fetched from an API — it uses static definitions
 * with download URLs pointing to masterserver1.talesofnewerth.com.
 */
export const useS2Release = (channel: ReleaseChannels) => {
    const release = releaseDefinitions[channel];
    const data: ExtendedReleaseData = { ...release, channel };

    return {
        data,
        error: null,
        isLoading: false,
        isSuccess: true,
    };
};

export const getS2ReleaseDownload = (releaseData: ReleaseData, platformType: OsType): string => {
    const filePerPlatform: { [key in OsType]: string } = {
        "Windows_NT": "Savage2CEInstall.exe",
        "Darwin": "Savage2CEInstall.exe",
        "Linux": "sav2_2.2.0.0_release_aamd64.tar.gz",
    };

    const expectedName = filePerPlatform[platformType];
    const asset = releaseData.assets.find(a => a.name === expectedName);

    if (asset) return asset.download_url;

    throw new Error(`Platform "${platformType}" is not supported for release "${releaseData.tag_name}"!`);
};
