import { create } from "zustand";
import { persist } from "zustand/middleware";

export type HistoryEntryType = "install" | "update" | "repair" | "uninstall" | "replay";

export interface HistoryEntry {
    id: string;
    /** e.g. "Savage 2" */
    game: string;
    /** e.g. "Community Edition", "Beta Test Client", "Legacy Client" */
    channel: string;
    /** "install", "update", "repair", "uninstall", or "replay" */
    type: HistoryEntryType;
    /** The version that was installed/updated to */
    version: string | null;
    /** For updates: the version that was replaced */
    previousVersion: string | null;
    /** For repairs: the list of files that were repaired */
    repairedFiles?: string[];
    /** For mods: the name of the mod */
    modName?: string;
    /** For replays: the match id */
    matchId?: number;
    /** For replays: the map name */
    mapName?: string;
    /** ISO timestamp */
    timestamp: string;
}

interface DownloadHistoryState {
    entries: HistoryEntry[];
    addEntry: (entry: Omit<HistoryEntry, "id" | "timestamp">) => void;
    clearHistory: () => void;
}

export const useDownloadHistory = create<DownloadHistoryState>()(
    persist(
        (set) => ({
            entries: [],
            addEntry: (entry) =>
                set((state) => ({
                    entries: [
                        {
                            ...entry,
                            id: crypto.randomUUID(),
                            timestamp: new Date().toISOString(),
                        },
                        ...state.entries,
                    ].slice(0, 100), // keep last 100 entries
                })),
            clearHistory: () => set({ entries: [] }),
        }),
        {
            name: "download-history",
        }
    )
);
