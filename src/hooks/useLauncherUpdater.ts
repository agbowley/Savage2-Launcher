import { useCallback, useEffect, useRef, useState } from "react";
import { checkUpdate, installUpdate } from "@tauri-apps/api/updater";
import { relaunch } from "@tauri-apps/api/process";

/** How often to poll for launcher updates (ms). */
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export interface LauncherUpdateState {
    /** The version string of the available update, or null if up-to-date. */
    updateVersion: string | null;
    /** Whether an update is currently being downloaded / installed. */
    isUpdating: boolean;
    /** Kick off the update install + relaunch.  Pass `true` to simulate
     *  the install (dev mock mode) — waits 2 s then relaunches. */
    startUpdate: (mock?: boolean) => Promise<void>;
}

/**
 * Programmatically checks for launcher self-updates on startup and
 * periodically.  Instead of showing a dialog, it exposes the update
 * state so the UI can render an unobtrusive indicator.
 */
export function useLauncherUpdater(): LauncherUpdateState {
    const [updateVersion, setUpdateVersion] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const checking = useRef(false);

    useEffect(() => {
        const check = async () => {
            if (checking.current) return;
            checking.current = true;

            try {
                const { shouldUpdate, manifest } = await checkUpdate();
                if (shouldUpdate && manifest) {
                    setUpdateVersion(manifest.version);
                }
            } catch (e) {
                console.warn("Launcher update check failed:", e);
            } finally {
                checking.current = false;
            }
        };

        // Check immediately on mount
        check();

        // Then poll on an interval
        const interval = setInterval(check, CHECK_INTERVAL_MS);
        return () => clearInterval(interval);
    }, []);

    const startUpdate = useCallback(async (mock = false) => {
        if (isUpdating) return;
        setIsUpdating(true);
        try {
            if (mock) {
                // Simulate download + install delay, then restart
                await new Promise(r => setTimeout(r, 2000));
            } else {
                await installUpdate();
            }
            await relaunch();
        } catch (e) {
            console.warn("Launcher update failed:", e);
            setIsUpdating(false);
        }
    }, [isUpdating]);

    return { updateVersion, isUpdating, startUpdate };
}
