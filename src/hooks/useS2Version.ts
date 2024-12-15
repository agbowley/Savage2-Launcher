import { useEffect } from "react";
import { ExtendedReleaseData, getS2ReleaseZip, getS2ReleaseSigFromZipURL, ReleaseChannels } from "./useS2Release";
import { invoke } from "@tauri-apps/api/tauri";
import { type } from "@tauri-apps/api/os";
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
    payload?: TaskPayload
}

export const useS2Version = (releaseData: ExtendedReleaseData | undefined, profileName: ReleaseChannels): S2Version => {
    const { state, setState } = useS2State(`${releaseData?.name}-${releaseData?.id}-${releaseData?.tag_name}`);
    const task = useTask("Savage 2", profileName);
    const payload = usePayload(task?.taskUUID);

    useEffect(() => {
        (async () => {
            if (state || !releaseData) return;

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
            const zipUrl = getS2ReleaseZip(releaseData, platformType);
            const sigUrl = getS2ReleaseSigFromZipURL(releaseData, zipUrl);

            const downloader = new S2Download(
                zipUrl,
                sigUrl,
                releaseData.channel,
                releaseData.tag_name,
                profileName,
                () => { setState(S2States.AVAILABLE); }
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
                () => { setState(S2States.NEW_UPDATE); }
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
        console.log(releaseData.tag_name, profileName);

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

    return { state, play, download, uninstall, revealFolder, payload };
};
