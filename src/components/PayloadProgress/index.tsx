import { TaskPayload } from "@app/tasks/payload";
import Spinner from "@app/components/Spinner";
import styles from "./progress.module.css";

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

const PayloadProgress: React.FC<Props> = ({ payload, defaultText = "Loading", fullMode }: Props) => {
    if (!payload) {
        return <span>{defaultText}</span>;
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
    return (<span>Queued</span>);
};

interface ProgressDownloadingProps {
    payload: TaskPayload;
    fullMode?: boolean;
}

const ProgressDownloading: React.FC<ProgressDownloadingProps> = ({ payload, fullMode }: ProgressDownloadingProps) => {
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
            Downloading {percent}%
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
    return (<span>Installing</span>);
};

const ProgressChecking: React.FC = () => {
    return (<span>Checking files...</span>);
};

const ProgressVerifying: React.FC = () => {
    return (<span>Verifying</span>);
};

export default PayloadProgress;