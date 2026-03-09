import { TaskPayload } from "@app/tasks/payload";
import Spinner from "@app/components/Spinner";
import styles from "./progress.module.css";
import { useTranslation } from "react-i18next";

interface Props {
    payload?: TaskPayload;
    defaultText?: string;
    fullMode?: boolean;
}

/** Format bytes into a human-readable string (e.g. "1.23 GB", "456 MB"). */
function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format a speed in bytes/sec into a readable string (e.g. "12.5 MB/s"). */
function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec <= 0) return "—";
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

const PayloadProgress: React.FC<Props> = ({ payload, defaultText, fullMode }: Props) => {
    const { t } = useTranslation("launch");
    if (!payload) {
        return <span>{defaultText || t("loading", { ns: "common" })}</span>;
    }

    switch (payload.state) {
        case "downloading":
            return <ProgressDownloading payload={payload} fullMode={fullMode} />;
        case "checking":
            return <ProgressChecking />;
        case "installing":
            return <ProgressInstalling />;
        case "verifying":
            return <ProgressVerifying />;
        default:
            return <ProgressWaiting />;
    }
};

const ProgressWaiting: React.FC = () => {
    const { t } = useTranslation("launch");
    return (<span>{t("queued_status")}</span>);
};

interface ProgressDownloadingProps {
    payload: TaskPayload;
    fullMode?: boolean;
}

const ProgressDownloading: React.FC<ProgressDownloadingProps> = ({ payload, fullMode }: ProgressDownloadingProps) => {
    const { t } = useTranslation("launch");
    const percent = payload.total > 0
        ? ((payload.current / payload.total) * 100).toFixed(0)
        : "0";

    if (!fullMode) {
        return <span className={styles.download_compact}>
            {percent}% ({formatSpeed(payload.speed)})
        </span>;
    }

    return <div className={styles.download_info}>
        <span className={styles.download_left}>
            <Spinner size={12} color={"#2ED9FF"} className={styles.spinner} />
            {t("downloading_percent", { percent })}
        </span>
        <span className={styles.download_right}>
            <span className={styles.download_size}>
                {formatBytes(payload.current)} / {formatBytes(payload.total)}
            </span>
            <span className={styles.download_speed}>
                {formatSpeed(payload.speed)}
            </span>
        </span>
    </div>;
};

const ProgressInstalling: React.FC = () => {
    const { t } = useTranslation("launch");
    return (<span>{t("installing")}</span>);
};

const ProgressChecking: React.FC = () => {
    const { t } = useTranslation("launch");
    return (<span>{t("checking_files")}</span>);
};

const ProgressVerifying: React.FC = () => {
    const { t } = useTranslation("launch");
    return (<span>{t("verifying")}</span>);
};

export default PayloadProgress;