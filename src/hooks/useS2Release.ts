import { useMemo } from "react";
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
    version_url: string;
    manifest_url: string;
    assets: ReleaseAsset[];
};

export type ExtendedReleaseData = ReleaseData & {
    channel: ReleaseChannels;
};

const DOWNLOAD_BASE = "https://masterserver1.talesofnewerth.com";

/**
 * Static release definitions for each channel.
 * tag_name is the channel identifier used as the profile/folder name on disk.
 * version_url points to a remote version.txt for checking the latest version.
 */
const releaseDefinitions: Record<ReleaseChannels, ReleaseData> = {
    stable: {
        tag_name: "latest",
        name: "Community Edition",
        description: "The official live release of Savage 2: A Tortured Soul – Community Edition. 64-bit client with improved stability, performance, and quality-of-life improvements.",
        version_url: `${DOWNLOAD_BASE}/wb6/i686/latest/version.txt`,
        manifest_url: `${DOWNLOAD_BASE}/wb6/i686/latest/manifest.json`,
        assets: [
            {
                name: "Savage2CEInstall.exe",
                download_url: `${DOWNLOAD_BASE}/wb6/i686/latest/Savage2CEInstall.exe`,
            },
            {
                name: "Savage2CE.tar.gz",
                download_url: `${DOWNLOAD_BASE}/lr1/x86_64/latest/Savage2CE.tar.gz`,
            },
        ],
    },
    legacy: {
        tag_name: "legacy",
        name: "Legacy Client",
        description: "The legacy version of Savage 2. This version is no longer supported and does not receive updates, but is available for those who wish to play the original version of the game or want to play mods/maps or watch replays that are no longer compatible with the updated game.",
        version_url: `${DOWNLOAD_BASE}/wb6/i686/legacy/version.txt`,
        manifest_url: `${DOWNLOAD_BASE}/wb6/i686/legacy/manifest.json`,
        assets: [
            {
                name: "Savage2CEInstall.exe",
                download_url: `${DOWNLOAD_BASE}/wb6/i686/legacy/Savage2-2.1.1.1-windows-installer.exe`,
            },
            {
                name: "Savage2CE.tar.gz",
                download_url: `${DOWNLOAD_BASE}/lr1/x86_64/legacy/Savage2CE.tar.gz`,
            },
        ],
    },
    nightly: {
        tag_name: "beta",
        name: "Beta Test Client",
        description: "The beta test client for upcoming features and patches. Use this to help test changes before they go live.",
        version_url: `${DOWNLOAD_BASE}/wb6/i686/beta/version.txt`,
        manifest_url: `${DOWNLOAD_BASE}/wb6/i686/beta/manifest.json`,
        assets: [
            {
                name: "Savage2CEInstall.exe",
                download_url: `${DOWNLOAD_BASE}/wb6/i686/beta/Savage2CEInstall.exe`,
            },
            {
                name: "Savage2CE.tar.gz",
                download_url: `${DOWNLOAD_BASE}/lr1/x86_64/beta/Savage2CE.tar.gz`,
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
    const data = useMemo<ExtendedReleaseData>(() => ({ ...release, channel }), [channel]);

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
        "Linux": "Savage2CE.tar.gz",
    };

    const expectedName = filePerPlatform[platformType];
    const asset = releaseData.assets.find(a => a.name === expectedName);

    if (asset) return asset.download_url;

    throw new Error(`Platform "${platformType}" is not supported for release "${releaseData.tag_name}"!`);
};
