import stylesNormal from "./QueueEntry.module.css";
import stylesBanner from "./QueueEntryBanner.module.css";
import { CloseIcon } from "@app/assets/Icons";

interface Props {
    icon?: React.ReactNode;
    name?: string;
    versionChannel?: string;
    version?: string;
    bannerMode: boolean;
    onRemove?: () => void;
}

const BaseQueue: React.FC<Props> = ({ icon, name, versionChannel, version, bannerMode, onRemove }: Props) => {
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
            {onRemove && (
                <button className={styles.remove_button} onClick={onRemove} title="Remove">
                    <CloseIcon />
                </button>
            )}
        </div>
    </div>;
};

export default BaseQueue;