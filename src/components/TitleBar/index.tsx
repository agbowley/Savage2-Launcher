import { appWindow } from "@tauri-apps/api/window";

import styles from "./titlebar.module.css";
import { CloseIcon, MinimizeIcon } from "@app/assets/Icons";
import LauncherIcon from "@app/assets/SourceIcons/Official.png";
import { useTranslation } from "react-i18next";

let clickCount = 0;
let clickTimer: ReturnType<typeof setTimeout> | null = null;

const TitleBar: React.FC = () => {
    async function handleMouseDown(e: React.MouseEvent) {
        if ((e.target as HTMLElement).closest(`.${styles.buttons}`)) return;

        clickCount++;

        if (clickCount === 2) {
            // Double-click detected — maximize/restore
            if (clickTimer) clearTimeout(clickTimer);
            clickCount = 0;

            const maximized = await appWindow.isMaximized();
            if (maximized) {
                await appWindow.unmaximize();
            } else {
                await appWindow.maximize();
            }
        } else {
            // Wait briefly to see if a second click comes
            clickTimer = setTimeout(async () => {
                clickCount = 0;
                await appWindow.startDragging();
            }, 130);
        }
    }

    const { t } = useTranslation();

    return <div
        onMouseDown={handleMouseDown}
        className={styles.title_bar}>
        <div className={styles.text}>
            <img src={LauncherIcon} height={18} alt="Savage 2" />
            {t("savage2_launcher")}
        </div>

        <div className={styles.buttons}>
            <div onClick={() => appWindow.minimize()} className={styles.button}>
                <MinimizeIcon />
            </div>

            <div onClick={() => appWindow.hide()} className={styles.button}>
                <CloseIcon />
            </div>
        </div>
    </div>;
};

export default TitleBar;