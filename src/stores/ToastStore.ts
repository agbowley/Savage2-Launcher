import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ToastState {
    toastsEnabled: boolean;
    setToastsEnabled: (enabled: boolean) => void;
}

export const useToastStore = create<ToastState>()(
    persist(
        (set) => ({
            toastsEnabled: true,
            setToastsEnabled: (enabled) => set({ toastsEnabled: enabled }),
        }),
        {
            name: "toast-settings",
        }
    )
);
