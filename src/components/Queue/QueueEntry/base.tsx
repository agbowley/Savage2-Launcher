import stylesNormal from "./QueueEntry.module.css";
import stylesBanner from "./QueueEntryBanner.module.css";
import { CloseIcon } from "@app/assets/Icons";
import { useTranslation } from "react-i18next";

interface Props {
    icon?: React.ReactNode;
    name?: string;
    versionChannel?: string;
    version?: string;
    taskType?: "download" | "update" | "uninstall" | "repair" | "replay";
    isMod?: boolean;
    bannerMode: boolean;
    onRemove?: () => void;
}

function getTaskTypeLabel(taskType: string | undefined, t: (key: string) => string): string {
    switch (taskType) {
        case "download": return t("install_task");
        case "update": return t("update_task");
        case "uninstall": return t("uninstall_task");
        case "repair": return t("repair_task");
        case "replay": return t("replays_task");
        default: return t("queued_task");
    }
}

function getBadgeClass(styles: typeof stylesNormal, taskType?: string): string {
    switch (taskType) {
        case "download": return styles.badge_download;
        case "update": return styles.badge_update;
        case "uninstall": return styles.badge_uninstall;
        case "repair": return styles.badge_repair;
        case "replay": return styles.badge_replay;
        default: return "";
    }
}

const BaseQueue: React.FC<Props> = ({ icon, name, versionChannel, version, taskType, isMod, bannerMode, onRemove }: Props) => {
    const { t } = useTranslation();
    // Choose the right style
    let styles = stylesNormal;
    if (bannerMode) {
        styles = stylesBanner;
    }

    return <div className={styles.item}>
        <div className={styles.main}>
            <div className={styles.icon}>{icon}</div>
            <div className={styles.info}>
                <span className={styles.info_header}>{name} {version}</span>
                {versionChannel}
            </div>
        </div>
        <div className={styles.extra}>
            {!bannerMode && (taskType || isMod) && (
                <div className={styles.badges}>
                    {isMod && <span className={styles.badge_mod}>{t("mod_badge")}</span>}
                    {taskType && (
                        <span className={`${styles.badge} ${getBadgeClass(styles, taskType)}`}>
                            {getTaskTypeLabel(taskType, t)}
                        </span>
                    )}
                </div>
            )}
            {onRemove && (
                <button className={styles.remove_button} onClick={onRemove} title={t("remove")}>
                    <CloseIcon />
                </button>
            )}
        </div>
    </div>;
};

export default BaseQueue;