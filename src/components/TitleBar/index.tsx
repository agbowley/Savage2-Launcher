import { appWindow } from "@tauri-apps/api/window";

import styles from "./titlebar.module.css";
import { CloseIcon, MinimizeIcon } from "@app/assets/Icons";
import { TryCloseDialog } from "@app/dialogs/Dialogs/TryCloseDialog";
import { useCurrentTask } from "@app/tasks";
import { createAndShowDialog } from "@app/dialogs";

const TitleBar: React.FC = () => {
    const currentTask = useCurrentTask();

    async function tryClose() {
        // If there is no download, just close
        if (!currentTask?.startedAt) {
            appWindow.close();
            return;
        }

        // If there is one, show alert
        const output = await createAndShowDialog(TryCloseDialog);
        if (output === "close") {
            appWindow.close();
        }
    }

    async function handleDrag(e: React.MouseEvent) {
        // Only start dragging from the titlebar background, not from buttons
        if ((e.target as HTMLElement).closest(`.${styles.buttons}`)) return;
        await appWindow.startDragging();
    }

    async function handleDoubleClick(e: React.MouseEvent) {
        if ((e.target as HTMLElement).closest(`.${styles.buttons}`)) return;
        const maximized = await appWindow.isMaximized();
        if (maximized) {
            await appWindow.unmaximize();
        } else {
            await appWindow.maximize();
        }
    }

    return <div
        onMouseDown={handleDrag}
        onDoubleClick={handleDoubleClick}
        className={styles.title_bar}>
        <div className={styles.text}>
            Savage 2 Launcher
        </div>

        <div className={styles.buttons}>
            <div onClick={() => appWindow.minimize()} className={styles.button}>
                <MinimizeIcon />
            </div>

            <div onClick={() => tryClose()} className={styles.button}>
                <CloseIcon />
            </div>
        </div>
    </div>;
};

export default TitleBar;