import { useToastStore } from "@app/stores/ToastStore";
import { invoke } from "@tauri-apps/api/tauri";
import { useTranslation } from "react-i18next";
import styles from "./Settings.module.css";

const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
    { code: "de", label: "Deutsch" },
    { code: "fr", label: "Français" },
    { code: "pt", label: "Português" },
    { code: "ru", label: "Русский" },
];

function Settings() {
    const { t, i18n } = useTranslation("settings");
    const toastsEnabled = useToastStore((s) => s.toastsEnabled);
    const setToastsEnabled = useToastStore((s) => s.setToastsEnabled);

    const handleToggle = (enabled: boolean) => {
        setToastsEnabled(enabled);
        invoke("set_tray_notifications_label", { enabled });
    };

    const handleLanguageChange = (lang: string) => {
        i18n.changeLanguage(lang);
    };

    return (
        <div className={styles.page}>
            <h1 className={styles.heading}>{t("heading")}</h1>

            <div className={styles.section}>
                <div className={styles.section_title}>{t("language_section")}</div>

                <div className={styles.row}>
                    <div className={styles.row_text}>
                        <span className={styles.row_label}>{t("language_label")}</span>
                        <span className={styles.row_description}>
                            {t("language_description")}
                        </span>
                    </div>
                    <select
                        className={styles.select}
                        value={LANGUAGES.find((l) => i18n.language.startsWith(l.code))?.code ?? "en"}
                        onChange={(e) => handleLanguageChange(e.target.value)}
                    >
                        {LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                                {lang.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.section_title}>{t("notifications_section")}</div>

                <div className={styles.row}>
                    <div className={styles.row_text}>
                        <span className={styles.row_label}>{t("toast_label")}</span>
                        <span className={styles.row_description}>
                            {t("toast_description")}
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