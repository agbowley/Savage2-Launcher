import { useQuery } from "@tanstack/react-query";
import { OsType } from "@tauri-apps/api/os";
import { repositoryBaseURL } from "@app/utils/consts";

export type ReleaseChannels = "stable" | "nightly" | "legacy";

type ReleaseData = {
    url: string;
    assets_url: string;
    html_url: string;
    id: number;
    tag_name: string;
    name: string;
    description: string;
    draft: boolean;
    prerelease: boolean;
    created_at: string;
    published_at: string;
    assets: {
        url: string;
        id: number;
        name: string;
        content_type: string;
        size: number;
        download_url: string;
    }[];
};

export type ExtendedReleaseData = ReleaseData & {
    channel: ReleaseChannels;
};

export const useS2Release = (channel: ReleaseChannels) => {
    const repositoryName = {
        "legacy": "Legacy Client",
        "stable": "Community Edition",
        "nightly": "Beta Test Client"
    };

    return useQuery({
        queryKey: ["agbowley", channel],
        queryFn: async (): Promise<ReleaseData> => await fetch(
            `${repositoryBaseURL}/api/releases/${repositoryName[channel]}/latest`)
            .then(res => res.json()),
        select: (data): ExtendedReleaseData => ({ ...data, channel: channel })
    });
};

export const getS2ReleaseZip = (releaseData: ReleaseData, platformType: OsType) => {
    const suffixesPerPlatform: { [key in OsType]: string[] } = {
        "Windows_NT": ["Savage.2.-.A.Tortured.Soul.zip"],
        "Darwin": ["Savage.2.-.A.Tortured.Soul.zip"],
        "Linux": ["Savage.2.-.A.Tortured.Soul.zip", "Savage.2.-.A.Tortured.Soul.zip"],
    };

    const platformSuffixes = suffixesPerPlatform[platformType];

    const asset = releaseData.assets.find(asset => {
        return platformSuffixes.find(suffix => asset.name.endsWith(suffix));
    });

    if (asset) return asset.download_url;

    throw new Error(`Platform of type "${platformType}" is not supported in release "${releaseData.tag_name}"!`);
};

export const getS2ReleaseSigFromZipURL = (releaseData: ReleaseData, zipUrl: string) => {
    const sigAssetName = zipUrl.split("/").slice(-1) + ".sig";

    const asset = releaseData.assets.find(asset => asset.name === sigAssetName);

    if (asset) return asset.download_url;

    console.warn(`Failed to find signature file "${sigAssetName}" in release "${releaseData.tag_name}"!`);
    return undefined;
};
