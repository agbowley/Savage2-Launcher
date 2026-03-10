import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ModSortBy } from "@app/types/mods";

type ActiveTab = "news" | "mods" | "servers";
type SubTab = "browse" | "installed";

export interface CachedTag {
    id: number;
    name: string;
    slug: string;
    color: string;
}

interface BrowsePrefsState {
    activeTab: ActiveTab;
    subTab: SubTab;
    sortBy: ModSortBy;
    sortDesc: boolean;
    viewMode: "grid" | "list";
    selectedTagIds: number[];
    cachedTags: CachedTag[];
    setActiveTab: (tab: ActiveTab) => void;
    setSubTab: (tab: SubTab) => void;
    setSortBy: (sortBy: ModSortBy) => void;
    setSortDesc: (desc: boolean) => void;
    setViewMode: (mode: "grid" | "list") => void;
    setSelectedTagIds: (ids: number[]) => void;
    setCachedTags: (tags: CachedTag[]) => void;
}

export const useBrowsePrefsStore = create<BrowsePrefsState>()(
    persist(
        (set) => ({
            activeTab: "news",
            subTab: "browse",
            sortBy: "downloads",
            sortDesc: true,
            viewMode: "list",
            selectedTagIds: [],
            cachedTags: [],
            setActiveTab: (activeTab) => set({ activeTab }),
            setSubTab: (subTab) => set({ subTab }),
            setSortBy: (sortBy) => set({ sortBy }),
            setSortDesc: (sortDesc) => set({ sortDesc }),
            setViewMode: (viewMode) => set({ viewMode }),
            setSelectedTagIds: (selectedTagIds) => set({ selectedTagIds }),
            setCachedTags: (cachedTags) => set({ cachedTags }),
        }),
        {
            name: "browse-prefs",
        },
    ),
);
