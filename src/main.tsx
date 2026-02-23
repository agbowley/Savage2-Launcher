import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
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

window.addEventListener("error", event => {
    logError(JSON.stringify(serializeError(event)));
});

const App: React.FC = () => {
    const [error, setError] = useState<unknown>(null);

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

    // Show error screen
    if (error) {
        return <React.StrictMode>
            <TitleBar />
            <p>
                An error has occurred when attempted to initalize the launcher. Please report this on our Discord and include the following error message:
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