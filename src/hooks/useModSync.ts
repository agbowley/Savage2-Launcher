import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useModsStore } from "@app/stores/ModsStore";
import { showUnknownModDialog } from "@app/dialogs/dialogUtil";
import type { ModManifest, UnknownModFile, InstalledMod } from "@app/types/mods";

/**
 * Hook that syncs the mod manifest from disk and detects unknown mods.
 *
 * Should be called once per channel when the Mods tab is opened.
 * On mount it:
 *  1. Loads mods.json from disk and syncs to Zustand store
 *  2. Scans the game folder for unknown resources*.s2z files
 *  3. Shows a dialog if unknowns are found, letting the user register or ignore
 */
export function useModSync(profile: string) {
    const syncFromManifest = useModsStore((s) => s.syncFromManifest);
    const addMod = useModsStore((s) => s.addMod);
    const ignoreFile = useModsStore((s) => s.ignoreFile);
    const toManifest = useModsStore((s) => s.toManifest);
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        (async () => {
            try {
                // 1. Load manifest from disk
                const manifest = await invoke<ModManifest>("load_mod_manifest", { profile });
                syncFromManifest(profile, manifest);

                // 2. Detect unknown mods
                const unknowns = await invoke<UnknownModFile[]>("detect_unknown_mods", { profile });
                if (unknowns.length === 0) return;

                // 3. Show dialog
                const decision = await showUnknownModDialog(unknowns);
                if (!decision) return;

                // 4. Process decisions
                const modsForManifest = useModsStore.getState().getMods(profile);
                const maxOrder = modsForManifest.reduce((max, m) => Math.max(max, m.loadOrder), 0);
                let orderCounter = maxOrder;

                for (const file of unknowns) {
                    const action = decision.actions[file.filename];
                    if (action === "ignore") {
                        ignoreFile(profile, file.filename);
                    } else if (action === "register") {
                        orderCounter += 1;
                        const modName = decision.modNames[file.filename] || file.filename;
                        const customMod: InstalledMod = {
                            id: crypto.randomUUID(),
                            apiModId: null,
                            name: modName,
                            author: "Unknown",
                            installedVersion: "1.0.0",
                            installedVersionId: null,
                            enabled: true,
                            loadOrder: orderCounter,
                            files: [{
                                filename: file.filename,
                                hash: file.hash,
                                type: "s2z",
                            }],
                            isCustom: true,
                            isMap: false,
                            installedAt: new Date().toISOString(),
                        };
                        addMod(profile, customMod);

                        // File is already in /game/ — no copy needed for custom mods
                    }
                }

                // 5. Persist updated manifest
                const updatedManifest = toManifest(profile);
                await invoke("save_mod_manifest", { profile, manifest: updatedManifest });
            } catch (err) {
                console.error("Mod sync failed:", err);
            }
        })();
    }, [profile, syncFromManifest, addMod, ignoreFile, toManifest]);
}
