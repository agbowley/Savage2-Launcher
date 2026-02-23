import { useToastStore } from "@app/stores/ToastStore";
import { invoke } from "@tauri-apps/api/tauri";
import styles from "./Settings.module.css";

function Settings() {
    const toastsEnabled = useToastStore((s) => s.toastsEnabled);
    const setToastsEnabled = useToastStore((s) => s.setToastsEnabled);

    const handleToggle = (enabled: boolean) => {
        setToastsEnabled(enabled);
        invoke("set_tray_notifications_label", { enabled });
    };

    return (
        <div className={styles.page}>
            <h1 className={styles.heading}>Settings</h1>

            <div className={styles.section}>
                <div className={styles.section_title}>Notifications</div>

                <div className={styles.row}>
                    <div className={styles.row_text}>
                        <span className={styles.row_label}>Toast Notifications</span>
                        <span className={styles.row_description}>
                            Show pop-up alerts when downloads finish or updates are available (only while minimised to tray)
                        </span>
                    </div>
                    <label className={styles.toggle}>
                        <input
                            type="checkbox"
                            checked={toastsEnabled}
                            onChange={(e) => handleToggle(e.target.checked)}
                        />
                        <span className={styles.slider} />
                    </label>
                </div>
            </div>
        </div>
    );
}

export default Settings;