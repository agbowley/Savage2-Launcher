import { useEffect, useState } from "react";
import { ExtendedReleaseData, getS2ManifestUrl, getS2ReleaseDownload, ReleaseChannels } from "./useS2Release";
import { invoke } from "@tauri-apps/api/tauri";
import { type } from "@tauri-apps/api/os";
import { open } from "@tauri-apps/api/dialog";
import { useS2State } from "@app/stores/S2StateStore";
import { S2Download, S2PatchUpdate, S2Uninstall } from "@app/tasks/Processors/S2";
import { showErrorDialog, showInstallFolderDialog, showUninstallDialog } from "@app/dialogs/dialogUtil";
import { addTask, cancelTask, useTask } from "@app/tasks";
import { usePayload, TaskPayload } from "@app/tasks/payload";
import { IBaseTask } from "@app/tasks/Processors/base";
import { useDownloadHistory } from "@app/stores/DownloadHistoryStore";
import { showToast } from "@app/utils/toast";

export enum S2States {
    "AVAILABLE",
    "DOWNLOADING",
    "UPDATING",
    "REPAIRING",
    "UNINSTALLING",
    "ERROR",
    "PLAYING",
    "LOADING",
    "NEW_UPDATE",
    "UPDATE_AVAILABLE"
}

export type S2Version = {
    state: S2States,
    play: () => Promise<void>,
    download: () => Promise<void>,
    cancel: () => Promise<void>,
    uninstall: () => Promise<void>,
    revealFolder: () => Promise<void>,
    checkForUpdates: () => Promise<void>,
    changeInstallLocation: () => Promise<void>,
    verifyInstallation: () => Promise<void>,
    verificationWarning: boolean,
    installedVersion: string | null,
    latestVersion: string | null,
    installPath: string | null,
    downloadLocation: string | null,
    releaseDate: string | null,
    payload?: TaskPayload,
    task?: IBaseTask
}

/** Cache fetched version info per profile so values are instant on repeat visits. */
type VersionCache = {
    installedVersion: string | null;
    latestVersion: string | null;
    installPath: string | null;
    downloadLocation: string | null;
    releaseDate: string | null;
};
const versionCache = new Map<string, VersionCache>();

export const useS2Version = (releaseData: ExtendedReleaseData | undefined, profileName: ReleaseChannels): S2Version => {
    const profile = releaseData?.tag_name || profileName;
    const { state, setState } = useS2State(`${releaseData?.name}-${profileName}`);
    const task = useTask("Savage 2", profile);
    const payload = usePayload(task?.taskUUID);

    const cached = versionCache.get(profile);
    const [installedVersion, setInstalledVersion] = useState<string | null>(cached?.installedVersion ?? null);
    const [latestVersion, setLatestVersion] = useState<string | null>(cached?.latestVersion ?? null);
    const [installPath, setInstallPath] = useState<string | null>(cached?.installPath ?? null);
    const [downloadLocation, setDownloadLocation] = useState<string | null>(cached?.downloadLocation ?? null);
    const [releaseDate, setReleaseDate] = useState<string | null>(cached?.releaseDate ?? null);
    const [verificationWarning, setVerificationWarning] = useState<boolean>(false);

    // Fetch installed version, remote version, and install path on mount / after state changes
    useEffect(() => {
        (async () => {
            if (!releaseData) return;

            // Track fetched values locally so we can write them all to cache at the end
            let fetchedVersion: string | null = cached?.installedVersion ?? null;
            let fetchedLatest: string | null = cached?.latestVersion ?? null;
            let fetchedPath: string | null = cached?.installPath ?? null;
            let fetchedLocation: string | null = cached?.downloadLocation ?? null;
            let fetchedDate: string | null = cached?.releaseDate ?? null;

            try {
                const version = await invoke("get_installed_version", {
                    appName: "Savage 2",
                    profile
                }) as string | null;

                fetchedVersion = version;
                setInstalledVersion(version);

                // Always fetch the install path (shows where the game would be / is)
                const path = await invoke("get_install_path", {
                    appName: "Savage 2",
                    profile
                }) as string;
                fetchedPath = path;
                setInstallPath(path);

                // Get the profile-specific install location
                try {
                    const profileLocation = await invoke("get_profile_location", {
                        profile
                    }) as string;
                    fetchedLocation = profileLocation || null;
                    setDownloadLocation(fetchedLocation);
                } catch {
                    // Not yet initialized
                }

                // Fetch remote latest version
                try {
                    const remoteVersion = await invoke("fetch_remote_version", {
                        versionUrl: releaseData.version_url
                    }) as string;
                    fetchedLatest = remoteVersion;
                    setLatestVersion(remoteVersion);
                } catch (e) {
                    console.error("Failed to fetch remote version:", e);
                }

                // Fetch release date from the remote file's Last-Modified header
                try {
                    const firstAsset = releaseData.assets[0];
                    if (firstAsset) {
                        const lastModified = await invoke("fetch_last_modified", {
                            url: firstAsset.download_url
                        }) as string | null;
                        if (lastModified) {
                            fetchedDate = lastModified;
                            setReleaseDate(lastModified);
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch release date:", e);
                }
            } catch (e) {
                console.error("Failed to get installed version info:", e);
            }

            // Update the cache so next mount is instant
            versionCache.set(profile, {
                installedVersion: fetchedVersion,
                latestVersion: fetchedLatest,
                installPath: fetchedPath,
                downloadLocation: fetchedLocation,
                releaseDate: fetchedDate,
            });
        })();
    }, [releaseData, state]);

    useEffect(() => {
        (async () => {
            if (!releaseData) return;
            // Skip if we're in a transient state (downloading, playing, etc.)
            if (state === S2States.DOWNLOADING || state === S2States.UPDATING || state === S2States.REPAIRING || state === S2States.UNINSTALLING || state === S2States.PLAYING || state === S2States.LOADING) return;

            try {
                const exists = await invoke("exists", {
                    appName: "Savage 2",
                    profile
                });

                if (!exists) {
                    setState(S2States.NEW_UPDATE);
                } else if (installedVersion && latestVersion && installedVersion !== latestVersion) {
                    setState(S2States.UPDATE_AVAILABLE);
                    showToast(
                        "Update Available",
                        `Savage 2 — ${releaseData.name} ${latestVersion}`
                    );
                } else {
                    setState(S2States.AVAILABLE);
                }
            } catch (e) {
                console.error("Failed to check if game exists:", e);
                setState(S2States.NEW_UPDATE);
            }
        })();
    }, [releaseData, installedVersion, latestVersion]);

    if (!releaseData) {
        return {
            state,
            play: async () => {},
            download: async () => {},
            cancel: async () => {},
            uninstall: async () => {},
            revealFolder: async () => {},
            checkForUpdates: async () => {},
            changeInstallLocation: async () => {},
            verifyInstallation: async () => {},
            verificationWarning: false,
            installedVersion: null,
            latestVersion: null,
            installPath: null,
            downloadLocation: null,
            releaseDate: null,
        };
    }

    const play = async () => {
        if (!releaseData) return;

        setState(S2States.LOADING);

        try {
            // Verify game files against the manifest before launching.
            // If any files are missing or corrupted, repair them first.
            const platformType = await type();
            const manifestUrl = getS2ManifestUrl(releaseData, platformType);
            if (manifestUrl) {
                let needsRepair = false;
                try {
                    needsRepair = await invoke("verify_files", {
                        appName: "Savage 2",
                        profile,
                        manifestUrl
                    }) as boolean;
                } catch (e) {
                    // If verification fails (e.g. no network), skip and launch anyway
                    console.warn("File verification failed, launching anyway:", e);
                }

                if (needsRepair) {
                    // Files need repair — route through the task queue so
                    // progress is visible in the downloads list.
                    setState(S2States.REPAIRING);

                    const repairTask = new S2PatchUpdate(
                        manifestUrl,
                        releaseData.channel,
                        profile,
                        () => {}
                    );

                    await new Promise<void>((resolve, reject) => {
                        repairTask.onFinish = () => resolve();
                        repairTask.onError = (err) => reject(err);
                        repairTask.onCancel = () => reject("CANCELLED");
                        addTask(repairTask);
                    });

                    // Log repair to download history
                    useDownloadHistory.getState().addEntry({
                        game: "Savage 2",
                        channel: releaseData.name,
                        type: "repair",
                        version: installedVersion,
                        previousVersion: null,
                        repairedFiles: repairTask.repairedFiles,
                    });

                    // If any files were skipped during repair, show a warning
                    // but still allow launching.
                    if (repairTask.skippedFiles.length > 0) {
                        setVerificationWarning(true);
                        console.warn("Repair completed with skipped files:", repairTask.skippedFiles);
                    } else {
                        setVerificationWarning(false);
                    }

                    setState(S2States.LOADING);
                }
            }

            await invoke("launch", {
                appName: "Savage 2",
                profile
            });

            setState(S2States.PLAYING);

            setTimeout(() => {
                setState(S2States.AVAILABLE);
            }, 10 * 1000);
        } catch (e) {
            const errMsg = e as string;
            if (errMsg === "CANCELLED") {
                setState(S2States.AVAILABLE);
                return;
            }
            setState(S2States.ERROR);
            showErrorDialog(errMsg);
            console.error(e);
        }
    };

    const download = async () => {
        if (!releaseData || state === S2States.DOWNLOADING || state === S2States.UPDATING || state === S2States.REPAIRING) return;

        if (!await showInstallFolderDialog()) {
            return;
        }

        // If no profile-specific location is set, inherit the global one
        try {
            const profileLoc = await invoke("get_profile_location", {
                profile
            }) as string;
            const globalLoc = await invoke("get_download_location") as string;

            // get_profile_location falls back to global, so if they match
            // and no explicit profile location was set, save the global as profile default
            if (profileLoc === globalLoc) {
                await invoke("set_profile_location", {
                    profile,
                    path: globalLoc
                });
            }
            setDownloadLocation(profileLoc);
        } catch {
            // Continue anyway
        }

        setState(S2States.DOWNLOADING);

        try {
            const platformType = await type();
            const downloadUrl = getS2ReleaseDownload(releaseData, platformType);
            const manifestUrl = getS2ManifestUrl(releaseData, platformType);

            const onSuccess = async () => {
                // Save the remote version as the installed version after successful download
                if (latestVersion) {
                    try {
                        await invoke("save_installed_version", {
                            appName: "Savage 2",
                            profile,
                            version: latestVersion
                        });
                    } catch (e) {
                        console.error("Failed to save installed version:", e);
                    }
                }

                // Log to download history
                useDownloadHistory.getState().addEntry({
                    game: "Savage 2",
                    channel: releaseData.name,
                    type: gameExists ? "update" : "install",
                    version: latestVersion,
                    previousVersion: gameExists ? previousVersion : null,
                });

                // Toast
                showToast(
                    gameExists ? "Update Complete" : "Install Complete",
                    `Savage 2 — ${releaseData.name} ${latestVersion ?? ""}`
                );

                setState(S2States.AVAILABLE);
                setInstalledVersion(latestVersion);
            };

            const onError = async () => {
                try {
                    const stillExists = await invoke("exists", { appName: "Savage 2", profile });
                    setState(stillExists ? S2States.UPDATE_AVAILABLE : S2States.NEW_UPDATE);
                } catch {
                    setState(S2States.NEW_UPDATE);
                }
            };

            const onCancel = async () => {
                try {
                    const stillExists = await invoke("exists", { appName: "Savage 2", profile });
                    setState(stillExists ? S2States.UPDATE_AVAILABLE : S2States.NEW_UPDATE);
                } catch {
                    setState(S2States.NEW_UPDATE);
                }
            };

            // Use incremental patch update when the game is already installed
            // (UPDATE_AVAILABLE state), and a manifest URL is available.
            // Falls back to full download if the manifest isn't hosted yet.
            const gameExists = await invoke("exists", { appName: "Savage 2", profile });
            const previousVersion = installedVersion;
            let task: S2Download | S2PatchUpdate;

            if (gameExists && manifestUrl) {
                setState(S2States.UPDATING);
                task = new S2PatchUpdate(
                    manifestUrl,
                    releaseData.channel,
                    profile,
                    onSuccess
                );
            } else {
                task = new S2Download(
                    downloadUrl,
                    undefined,
                    releaseData.channel,
                    profile,
                    onSuccess
                );
            }

            task.onError = onError;
            task.onCancel = onCancel;

            addTask(task);
        } catch (e) {
            setState(S2States.ERROR);
            showErrorDialog(e as string);
            console.error(e);
        }
    };

    const uninstall = async () => {
        if (!releaseData || state === S2States.DOWNLOADING || state === S2States.UNINSTALLING) return;

        if (!await invoke("is_initialized")) return;

        const confirmed = await showUninstallDialog(`Savage 2 - ${releaseData.name}`);
        if (!confirmed) return;

        setState(S2States.UNINSTALLING);

        try {
            const platformType = await type();
            const manifestUrl = getS2ManifestUrl(releaseData, platformType);

            const downloader = new S2Uninstall(
                manifestUrl,
                releaseData.channel,
                profile,
                () => {
                    useDownloadHistory.getState().addEntry({
                        game: "Savage 2",
                        channel: releaseData.name,
                        type: "uninstall",
                        version: installedVersion,
                        previousVersion: null,
                    });

                    setState(S2States.NEW_UPDATE);
                    setInstalledVersion(null);
                    setInstallPath(null);
                }
            );

            downloader.onError = () => {
                setState(S2States.AVAILABLE);
            };

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
                profile
            });
        } catch (e) {
            showErrorDialog(e as string);
            console.error(e);
        }
    };

    const checkForUpdates = async () => {
        if (!releaseData) return;

        try {
            // Detect the installed version (runs exe + parses console.log)
            const detected = await invoke("detect_installed_version", {
                appName: "Savage 2",
                profile
            }) as string | null;

            setInstalledVersion(detected);

            // Fetch the latest remote version
            const remote = await invoke("fetch_remote_version", {
                versionUrl: releaseData.version_url
            }) as string;

            setLatestVersion(remote);

            if (!detected) {
                setState(S2States.NEW_UPDATE);
            } else if (detected !== remote) {
                setState(S2States.UPDATE_AVAILABLE);
            } else {
                setState(S2States.AVAILABLE);
            }
        } catch (e) {
            showErrorDialog(e as string);
            console.error(e);
        }
    };

    const verifyInstallation = async () => {
        if (!releaseData) return;
        if (state === S2States.DOWNLOADING || state === S2States.UPDATING || state === S2States.REPAIRING || state === S2States.UNINSTALLING) return;

        setState(S2States.LOADING);

        try {
            const platformType = await type();
            const manifestUrl = getS2ManifestUrl(releaseData, platformType);
            if (!manifestUrl) {
                setState(S2States.AVAILABLE);
                return;
            }

            // Run a full patch_update which will hash-check all files
            // and re-download any that are missing or mismatched.
            setState(S2States.REPAIRING);

            const repairTask = new S2PatchUpdate(
                manifestUrl,
                releaseData.channel,
                profile,
                () => {}
            );

            await new Promise<void>((resolve, reject) => {
                repairTask.onFinish = () => resolve();
                repairTask.onError = (err) => reject(err);
                repairTask.onCancel = () => reject("CANCELLED");
                addTask(repairTask);
            });

            // Log repair to download history
            useDownloadHistory.getState().addEntry({
                game: "Savage 2",
                channel: releaseData.name,
                type: "repair",
                version: installedVersion,
                previousVersion: null,
                repairedFiles: repairTask.repairedFiles,
            });

            if (repairTask.skippedFiles.length > 0) {
                setVerificationWarning(true);
                showToast(
                    "Verification Warning",
                    `${repairTask.skippedFiles.length} file(s) could not be verified`
                );
            } else {
                setVerificationWarning(false);
                showToast(
                    "Verification Complete",
                    "All files verified successfully"
                );
            }

            setState(S2States.AVAILABLE);
        } catch (e) {
            const errMsg = e as string;
            if (errMsg === "CANCELLED") {
                setState(S2States.AVAILABLE);
                return;
            }
            setState(S2States.ERROR);
            showErrorDialog(errMsg);
            console.error(e);
        }
    };

    const changeInstallLocation = async () => {
        try {
            // Get the current profile location to use as default directory
            let defaultPath: string | undefined;
            try {
                defaultPath = await invoke("get_profile_location", {
                    profile
                }) as string;
            } catch {
                // No default
            }

            const selected = await open({
                directory: true,
                multiple: false,
                title: "Choose Install Location",
                defaultPath: defaultPath || undefined
            });

            if (selected && typeof selected === "string") {
                // Save per-profile location
                await invoke("set_profile_location", {
                    profile,
                    path: selected
                });
                setDownloadLocation(selected);

                // Re-check if the game exists at the new location
                const gameExists = await invoke("exists", {
                    appName: "Savage 2",
                    profile
                });
                if (!gameExists) {
                    setState(S2States.NEW_UPDATE);
                } else if (installedVersion && latestVersion && installedVersion !== latestVersion) {
                    setState(S2States.UPDATE_AVAILABLE);
                } else {
                    setState(S2States.AVAILABLE);
                }
            }
        } catch (e) {
            showErrorDialog(e as string);
            console.error(e);
        }
    };

    const cancel = async () => {
        if (state !== S2States.DOWNLOADING && state !== S2States.UPDATING && state !== S2States.REPAIRING && state !== S2States.UNINSTALLING) return;
        if (!task) return;
        await cancelTask(task);
    };

    return {
        state,
        play,
        download,
        cancel,
        uninstall,
        revealFolder,
        checkForUpdates,
        changeInstallLocation,
        verifyInstallation,
        verificationWarning,
        installedVersion,
        latestVersion,
        installPath,
        downloadLocation,
        releaseDate,
        payload,
        task
    };
};
