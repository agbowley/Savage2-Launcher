import styles from "./ErrorScreen.module.css";
import { error as LogError } from "tauri-plugin-log-api";
import { FallbackProps } from "react-error-boundary";
import { appWindow } from "@tauri-apps/api/window";
import i18n from "@app/i18n";


export function ErrorScreen({error}: FallbackProps) {
    return <div className={styles.error}>
        <p>
            {i18n.t("error_report")}
        </p>
        <code>
            {error && error.message}
        </code>
        <div className={styles.closeButton} onClick={() => appWindow.close()}>{i18n.t("close_launcher")}</div>
    </div>;
}

export function onError(error: Error) {
    LogError(`${error}`);
}