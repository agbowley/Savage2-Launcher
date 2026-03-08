import { create } from "zustand";
import { tauriFetchAuthJson } from "@app/utils/tauriFetch";
import { useAuthStore } from "./AuthStore";
import { composeType } from "@app/routes/Account/runeData";

interface ApiItem {
    id: number;
    type: number;
    color: number;
    passive: number;
    active: number;
}

export interface VaultItem {
    id: number;
    compositeType: number;
}

function toVaultItem(item: ApiItem): VaultItem {
    return { id: item.id, compositeType: composeType(item.type, item.color, item.passive, item.active) };
}

interface VaultState {
    activeItems: VaultItem[];
    storedItems: VaultItem[];
    fetchActive: () => Promise<void>;
    fetchStored: () => Promise<void>;
    clear: () => void;
}

export const useVaultStore = create<VaultState>()((set) => ({
    activeItems: [],
    storedItems: [],

    fetchActive: async () => {
        try {
            const token = useAuthStore.getState().authToken;
            if (!token) return;
            const data = await tauriFetchAuthJson<ApiItem[]>("https://savage2.net/api/items/active", token);
            set({ activeItems: data.map(toVaultItem) });
        } catch { /* unavailable */ }
    },

    fetchStored: async () => {
        try {
            const token = useAuthStore.getState().authToken;
            if (!token) return;
            const data = await tauriFetchAuthJson<ApiItem[]>("https://savage2.net/api/items/stored", token);
            set({ storedItems: data.map(toVaultItem) });
        } catch { /* unavailable */ }
    },

    clear: () => set({ activeItems: [], storedItems: [] }),
}));

// Clear vault data on logout
useAuthStore.subscribe((state, prev) => {
    if (prev.user && !state.user) {
        useVaultStore.getState().clear();
    }
});
