import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ToastState {
    toastsEnabled: boolean;
    setToastsEnabled: (enabled: boolean) => void;
    autoLogin: boolean;
    setAutoLogin: (enabled: boolean) => void;
}

export const useToastStore = create<ToastState>()(
    persist(
        (set) => ({
            toastsEnabled: true,
            setToastsEnabled: (enabled) => set({ toastsEnabled: enabled }),
            autoLogin: false,
            setAutoLogin: (enabled) => set({ autoLogin: enabled }),
        }),
        {
            name: "toast-settings",
        }
    )
);
