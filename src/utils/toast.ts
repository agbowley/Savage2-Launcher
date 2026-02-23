import { appWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/tauri";
import { useToastStore } from "@app/stores/ToastStore";

/**
 * Show a native OS desktop notification (Windows notification center)
 * if the user has notifications enabled and the launcher is minimised to tray.
 * Clicking the notification brings the launcher to front.
 */
export async function showToast(
    title: string,
    body: string,
) {
    const { toastsEnabled } = useToastStore.getState();
    if (!toastsEnabled) return;

    // Only show notifications when the window is hidden in the tray
    const visible = await appWindow.isVisible();
    if (visible) return;

    invoke("show_notification", { title, body });
}
