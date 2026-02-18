import { useEffect, useState } from "react";
import { ExtendedReleaseData, getS2ReleaseDownload, ReleaseChannels } from "./useS2Release";
import { invoke } from "@tauri-apps/api/tauri";
import { type } from "@tauri-apps/api/os";
import { open } from "@tauri-apps/api/dialog";
import { useS2State } from "@app/stores/S2StateStore";
import { S2Download, S2Uninstall } from "@app/tasks/Processors/S2";
import { showErrorDialog, showInstallFolderDialog } from "@app/dialogs/dialogUtil";
import { addTask, useTask } from "@app/tasks";
import { usePayload, TaskPayload } from "@app/tasks/payload";

export enum S2States {
    "AVAILABLE",
    "DOWNLOADING",
    "ERROR",
    "PLAYING",
    "LOADING",
    "NEW_UPDATE"
}

export type S2Version = {
    state: S2States,
    play: () => Promise<void>,
    download: () => Promise<void>,
    uninstall: () => Promise<void>,
    revealFolder: () => Promise<void>,
    checkForUpdates: () => Promise<void>,
    changeInstallLocation: () => Promise<void>,
    installedVersion: string | null,
    latestVersion: string,
    installPath: string | null,
    downloadLocation: string | null,
    payload?: TaskPayload
}

export const useS2Version = (releaseData: ExtendedReleaseData | undefined, profileName: ReleaseChannels): S2Version => {
    const { state, setState } = useS2State(`${releaseData?.name}-${releaseData?.id}-${releaseData?.tag_name}`);
    const task = useTask("Savage 2", profileName);
    const payload = usePayload(task?.taskUUID);

    const [installedVersion, setInstalledVersion] = useState<string | null>(null);
    const [installPath, setInstallPath] = useState<string | null>(null);
    const [downloadLocation, setDownloadLocation] = useState<string | null>(null);

    // Fetch installed version and install path on mount / after state changes
    useEffect(() => {
        (async () => {
            if (!releaseData) return;

            try {
                const version = await invoke("get_installed_version", {
                    appName: "Savage 2",
                    version: releaseData.tag_name,
                    profile: profileName
                }) as string | null;

                setInstalledVersion(version);

                if (version) {
                    const path = await invoke("get_install_path", {
                        appName: "Savage 2",
                        version: releaseData.tag_name,
                        profile: profileName
                    }) as string;
                    setInstallPath(path);
                }

                // Always try to get the download location
                try {
                    const dlLocation = await invoke("get_download_location") as string;
                    setDownloadLocation(dlLocation || null);
                } catch {
                    // Not yet initialized
                }
            } catch (e) {
                console.error("Failed to get installed version info:", e);
            }
        })();
    }, [releaseData, state]);

    useEffect(() => {
        (async () => {
            if (!releaseData) return;
            // Skip if we're in a transient state (downloading, playing, etc.)
            if (state === S2States.DOWNLOADING || state === S2States.PLAYING || state === S2States.LOADING) return;
            if (state === S2States.AVAILABLE || state === S2States.NEW_UPDATE) return;

            const exists = await invoke("exists", {
                appName: "Savage 2",
                version: releaseData.tag_name,
                profile: profileName
            });

            setState(exists ? S2States.AVAILABLE : S2States.NEW_UPDATE);
        })();
    }, [releaseData]);

    if (!releaseData) {
        return {
            state,
            play: async () => {},
            download: async () => {},
            uninstall: async () => {},
            revealFolder: async () => {},
            checkForUpdates: async () => {},
            changeInstallLocation: async () => {},
            installedVersion: null,
            latestVersion: "",
            installPath: null,
            downloadLocation: null,
        };
    }

    const play = async () => {
        if (!releaseData) return;

        setState(S2States.LOADING);

        try {
            await invoke("launch", {
                appName: "Savage 2",
                version: releaseData.tag_name,
                profile: profileName
            });

            setState(S2States.PLAYING);

            setTimeout(() => {
                setState(S2States.AVAILABLE);
            }, 10 * 1000);
        } catch (e) {
            setState(S2States.ERROR);
            showErrorDialog(e as string);
            console.error(e);
        }
    };

    const download = async () => {
        if (!releaseData || state === S2States.DOWNLOADING) return;

        if (!await showInstallFolderDialog()) {
            return;
        }

        setState(S2States.DOWNLOADING);

        try {
            const platformType = await type();
            const downloadUrl = getS2ReleaseDownload(releaseData, platformType);

            const downloader = new S2Download(
                downloadUrl,
                undefined,
                releaseData.channel,
                releaseData.tag_name,
                profileName,
                () => {
                    setState(S2States.AVAILABLE);
                    setInstalledVersion(releaseData.tag_name);
                }
            );

            addTask(downloader);
        } catch (e) {
            setState(S2States.ERROR);
            showErrorDialog(e as string);
            console.error(e);
        }
    };

    const uninstall = async () => {
        if (!releaseData || state === S2States.DOWNLOADING) return;

        if (!await invoke("is_initialized")) return;

        setState(S2States.DOWNLOADING);

        try {
            const downloader = new S2Uninstall(
                releaseData.channel,
                releaseData.tag_name,
                profileName,
                () => {
                    setState(S2States.NEW_UPDATE);
                    setInstalledVersion(null);
                    setInstallPath(null);
                }
            );

            addTask(downloader);
        } catch (e) {
            setState(S2States.ERROR);
            showErrorDialog(e as string);
            console.error(e);
        }
    };

    const revealFolder = async () => {
        if (!releaseData) return;

        try {
            await invoke("reveal_folder", {
                appName: "Savage 2",
                version: releaseData.tag_name,
                profile: profileName
            });
        } catch (e) {
            showErrorDialog(e as string);
            console.error(e);
        }
    };

    const checkForUpdates = async () => {
        if (!releaseData) return;

        try {
            const currentVersion = await invoke("get_installed_version", {
                appName: "Savage 2",
                version: releaseData.tag_name,
                profile: profileName
            }) as string | null;

            setInstalledVersion(currentVersion);

            if (!currentVersion || currentVersion !== releaseData.tag_name) {
                setState(S2States.NEW_UPDATE);
            }
        } catch (e) {
            showErrorDialog(e as string);
            console.error(e);
        }
    };

    const changeInstallLocation = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "Choose Install Location"
            });

            if (selected && typeof selected === "string") {
                await invoke("set_download_location", { path: selected });
                setDownloadLocation(selected);
            }
        } catch (e) {
            showErrorDialog(e as string);
            console.error(e);
        }
    };

    return {
        state,
        play,
        download,
        uninstall,
        revealFolder,
        checkForUpdates,
        changeInstallLocation,
        installedVersion,
        latestVersion: releaseData.tag_name,
        installPath,
        downloadLocation,
        payload
    };
};
