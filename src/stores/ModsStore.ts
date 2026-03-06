import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InstalledMod, InstalledModFile, ModManifest } from "@app/types/mods";

/** Per-channel state. */
interface ChannelModState {
    mods: InstalledMod[];
    ignoredFiles: string[];
    lastSyncedAt: string | null;
}

interface ModsState {
    /** Keyed by channel profile tag: "latest" | "beta" | "legacy" */
    channels: Record<string, ChannelModState>;

    // ---- Actions ----

    /** Replace the full state for a channel from a loaded manifest. */
    syncFromManifest: (profile: string, manifest: ModManifest) => void;

    /** Get all mods for a channel. */
    getMods: (profile: string) => InstalledMod[];

    /** Get a single mod by local ID (e.g. slug or a UUID). */
    getMod: (profile: string, modId: string) => InstalledMod | undefined;

    /** Get an installed mod by its API numeric ID. */
    getModByApiId: (profile: string, apiModId: number) => InstalledMod | undefined;

    /** Add (install) a mod. */
    addMod: (profile: string, mod: InstalledMod) => void;

    /** Remove (uninstall) a mod completely. */
    removeMod: (profile: string, modId: string) => void;

    /** Toggle enabled state. */
    setModEnabled: (profile: string, modId: string, enabled: boolean) => void;

    /** Update load order for a mod. */
    setLoadOrder: (profile: string, modId: string, loadOrder: number) => void;

    /** Bulk-update load orders (e.g. after drag-and-drop reorder). */
    reorderMods: (profile: string, orderedIds: string[]) => void;

    /** Update installed version info after upgrading a mod. */
    updateModVersion: (
        profile: string,
        modId: string,
        version: string,
        versionId: number | null,
        files: InstalledModFile[],
    ) => void;

    /** Add a filename to the ignore list for unknown-mod detection. */
    ignoreFile: (profile: string, filename: string) => void;

    /** Build a ModManifest object ready for serialisation. */
    toManifest: (profile: string) => ModManifest;
}

const emptyChannel = (): ChannelModState => ({
    mods: [],
    ignoredFiles: [],
    lastSyncedAt: null,
});

const ensureChannel = (
    channels: Record<string, ChannelModState>,
    profile: string,
): ChannelModState => channels[profile] ?? emptyChannel();

export const useModsStore = create<ModsState>()(
    persist(
        (set, get) => ({
            channels: {},

            syncFromManifest: (profile, manifest) =>
                set((state) => ({
                    channels: {
                        ...state.channels,
                        [profile]: {
                            mods: manifest.mods,
                            ignoredFiles: manifest.ignoredFiles,
                            lastSyncedAt: new Date().toISOString(),
                        },
                    },
                })),

            getMods: (profile) => ensureChannel(get().channels, profile).mods,

            getMod: (profile, modId) =>
                ensureChannel(get().channels, profile).mods.find((m) => m.id === modId),

            getModByApiId: (profile, apiModId) =>
                ensureChannel(get().channels, profile).mods.find((m) => m.apiModId === apiModId),

            addMod: (profile, mod) =>
                set((state) => {
                    const ch = ensureChannel(state.channels, profile);
                    return {
                        channels: {
                            ...state.channels,
                            [profile]: { ...ch, mods: [...ch.mods, mod] },
                        },
                    };
                }),

            removeMod: (profile, modId) =>
                set((state) => {
                    const ch = ensureChannel(state.channels, profile);
                    const removed = ch.mods.find((m) => m.id === modId);
                    const remaining = ch.mods.filter((m) => m.id !== modId);

                    // Recompact load orders for non-map mods if the removed mod had a load order
                    let recompacted = remaining;
                    if (removed && !removed.isMap) {
                        const nonMaps = remaining
                            .filter((m) => !m.isMap)
                            .sort((a, b) => a.loadOrder - b.loadOrder);
                        const newOrderMap = new Map<string, number>();
                        nonMaps.forEach((m, i) => newOrderMap.set(m.id, i + 1));
                        recompacted = remaining.map((m) =>
                            newOrderMap.has(m.id) ? { ...m, loadOrder: newOrderMap.get(m.id)! } : m,
                        );
                    }

                    return {
                        channels: {
                            ...state.channels,
                            [profile]: {
                                ...ch,
                                mods: recompacted,
                            },
                        },
                    };
                }),

            setModEnabled: (profile, modId, enabled) =>
                set((state) => {
                    const ch = ensureChannel(state.channels, profile);
                    return {
                        channels: {
                            ...state.channels,
                            [profile]: {
                                ...ch,
                                mods: ch.mods.map((m) =>
                                    m.id === modId ? { ...m, enabled } : m,
                                ),
                            },
                        },
                    };
                }),

            setLoadOrder: (profile, modId, loadOrder) =>
                set((state) => {
                    const ch = ensureChannel(state.channels, profile);
                    return {
                        channels: {
                            ...state.channels,
                            [profile]: {
                                ...ch,
                                mods: ch.mods.map((m) =>
                                    m.id === modId ? { ...m, loadOrder } : m,
                                ),
                            },
                        },
                    };
                }),

            reorderMods: (profile, orderedIds) =>
                set((state) => {
                    const ch = ensureChannel(state.channels, profile);
                    const reordered = ch.mods.map((m) => {
                        const idx = orderedIds.indexOf(m.id);
                        return idx >= 0 ? { ...m, loadOrder: idx + 1 } : m;
                    });
                    return {
                        channels: {
                            ...state.channels,
                            [profile]: { ...ch, mods: reordered },
                        },
                    };
                }),

            updateModVersion: (profile, modId, version, versionId, files) =>
                set((state) => {
                    const ch = ensureChannel(state.channels, profile);
                    return {
                        channels: {
                            ...state.channels,
                            [profile]: {
                                ...ch,
                                mods: ch.mods.map((m) =>
                                    m.id === modId
                                        ? {
                                            ...m,
                                            installedVersion: version,
                                            installedVersionId: versionId,
                                            files,
                                        }
                                        : m,
                                ),
                            },
                        },
                    };
                }),

            ignoreFile: (profile, filename) =>
                set((state) => {
                    const ch = ensureChannel(state.channels, profile);
                    if (ch.ignoredFiles.includes(filename)) return state;
                    return {
                        channels: {
                            ...state.channels,
                            [profile]: {
                                ...ch,
                                ignoredFiles: [...ch.ignoredFiles, filename],
                            },
                        },
                    };
                }),

            toManifest: (profile) => {
                const ch = ensureChannel(get().channels, profile);
                return {
                    version: 1,
                    mods: ch.mods,
                    ignoredFiles: ch.ignoredFiles,
                };
            },
        }),
        {
            name: "installed-mods",
        },
    ),
);
