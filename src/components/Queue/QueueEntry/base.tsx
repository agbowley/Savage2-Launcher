import stylesNormal from "./QueueEntry.module.css";
import stylesBanner from "./QueueEntryBanner.module.css";
import { CloseIcon } from "@app/assets/Icons";

interface Props {
    icon?: React.ReactNode;
    name?: string;
    versionChannel?: string;
    version?: string;
    taskType?: "download" | "update" | "uninstall" | "repair";
    isMod?: boolean;
    bannerMode: boolean;
    onRemove?: () => void;
}

function getTaskTypeLabel(taskType?: string): string {
    switch (taskType) {
        case "download": return "Install";
        case "update": return "Update";
        case "uninstall": return "Uninstall";
        case "repair": return "Repair";
        default: return "Queued";
    }
}

function getBadgeClass(styles: typeof stylesNormal, taskType?: string): string {
    switch (taskType) {
        case "download": return styles.badge_download;
        case "update": return styles.badge_update;
        case "uninstall": return styles.badge_uninstall;
        case "repair": return styles.badge_repair;
        default: return "";
    }
}

const BaseQueue: React.FC<Props> = ({ icon, name, versionChannel, version, taskType, isMod, bannerMode, onRemove }: Props) => {
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
                    {isMod && <span className={styles.badge_mod}>Mod</span>}
                    {taskType && (
                        <span className={`${styles.badge} ${getBadgeClass(styles, taskType)}`}>
                            {getTaskTypeLabel(taskType)}
                        </span>
                    )}
                </div>
            )}
            {onRemove && (
                <button className={styles.remove_button} onClick={onRemove} title="Remove">
                    <CloseIcon />
                </button>
            )}
        </div>
    </div>;
};

export default BaseQueue;