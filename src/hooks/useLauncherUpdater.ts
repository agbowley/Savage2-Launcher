import { useEffect, useRef } from "react";
import { checkUpdate, installUpdate } from "@tauri-apps/api/updater";
import { relaunch } from "@tauri-apps/api/process";
import { ask } from "@tauri-apps/api/dialog";

/** How often to poll for launcher updates (ms). */
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Programmatically checks for launcher self-updates on startup and
 * periodically, prompts the user, installs, and relaunches.
 *
 * This replaces Tauri's built-in "dialog: true" updater mode so we
 * can control polling frequency and ensure the app restarts after
 * installing on Windows.
 */
export function useLauncherUpdater() {
    const checking = useRef(false);

    useEffect(() => {
        const check = async () => {
            if (checking.current) return;
            checking.current = true;

            try {
                const { shouldUpdate, manifest } = await checkUpdate();
                if (!shouldUpdate || !manifest) return;

                const yes = await ask(
                    `A new launcher update is available (${manifest.version}).\n\nWould you like to install it and restart?`,
                    { title: "Launcher Update Available", type: "info" }
                );

                if (!yes) return;

                await installUpdate();
                await relaunch();
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
}
