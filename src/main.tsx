import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./i18n";
import TitleBar from "./components/TitleBar";
import { RouterProvider } from "react-router-dom";
import Router from "@app/routes";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./query";
import { DialogProvider } from "./dialogs/DialogProvider";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorScreen, onError } from "./routes/ErrorScreen";
import { error as logError } from "tauri-plugin-log-api";
import { serializeError } from "serialize-error";
import LoadingScreen from "./components/LoadingScreen";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { useToastStore } from "./stores/ToastStore";
import { showToast } from "./utils/toast";
import { useAuthStore } from "./stores/AuthStore";
import i18n from "./i18n";
import { useTranslation } from "react-i18next";
window.addEventListener("error", event => {
    logError(JSON.stringify(serializeError(event)));
});

const App: React.FC = () => {
    const [error, setError] = useState<unknown>(null);
    const { t } = useTranslation();

    // Restore auth session on startup
    useEffect(() => {
        useAuthStore.getState().restoreSession();
    }, []);

    // Sync locale with Rust backend on startup and when language changes
    useEffect(() => {
        invoke("set_locale", { locale: i18n.language }).catch(() => {});
        const handleLangChange = (lng: string) => {
            invoke("set_locale", { locale: lng }).catch(() => {});
        };
        i18n.on("languageChanged", handleLangChange);
        return () => { i18n.off("languageChanged", handleLangChange); };
    }, []);

    // Sync tray "Notifications" label with store & listen for tray toggle clicks
    useEffect(() => {
        // Sync tray label on startup
        const enabled = useToastStore.getState().toastsEnabled;
        invoke("set_tray_notifications_label", { enabled });

        // Listen for tray menu "Notifications" toggle (state already changed in Rust)
        const unlisten = listen<boolean>("notifications-toggled", (event) => {
            useToastStore.getState().setToastsEnabled(event.payload);
        });

        return () => { unlisten.then((fn) => fn()); };
    }, []);

    // Listen for tray "Language" submenu clicks and sync frontend language
    useEffect(() => {
        const unlisten = listen<string>("tray-language-changed", (event) => {
            i18n.changeLanguage(event.payload);
        });
        return () => { unlisten.then((fn) => fn()); };
    }, []);

    // Listen for tray "Play" submenu clicks and launch the game directly
    useEffect(() => {
        const unlisten = listen<string>("tray-play", async (event) => {
            const profile = event.payload;
            try {
                await invoke("launch", { appName: "Savage 2", profile });
            } catch (e) {
                const msg = typeof e === "string" ? e : t("launch_failed");
                showToast(t("cannot_launch"), msg);
            }
        });
        return () => { unlisten.then((fn) => fn()); };
    }, []);

    // Show error screen
    if (error) {
        return <React.StrictMode>
            <TitleBar />
            <p>
                {t("error_init")}
            </p>
            <p>
                {error instanceof Error ? error.message : JSON.stringify(serializeError(error))}
            </p>
        </React.StrictMode>;
    }

    // Show main screen
    return <React.StrictMode>
        <LoadingScreen setError={setError} />

        <ErrorBoundary FallbackComponent={ErrorScreen} onError={onError}>
            <DialogProvider>
                <TitleBar />
                <QueryClientProvider client={queryClient}>
                    <RouterProvider router={Router} />
                </QueryClientProvider>
            </DialogProvider>
        </ErrorBoundary>
    </React.StrictMode>;
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);