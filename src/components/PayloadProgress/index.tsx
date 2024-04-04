import { TaskPayload } from "@app/tasks/payload";
import { ClipLoader } from "react-spinners";
import styles from "./progress.module.css";

interface Props {
    payload?: TaskPayload;
    defaultText?: string;
    fullMode?: boolean;
}

const PayloadProgress: React.FC<Props> = ({ payload, defaultText = "Loading", fullMode }: Props) => {
    if (!payload) {
        return <span>{defaultText}</span>;
    }

    switch (payload.state) {
        case "downloading":
            return <ProgressDownloading payload={payload} fullMode={fullMode} />;
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
    return <span>
        {fullMode &&
        <ClipLoader size={12} color={"#2ED9FF"} className={styles.spinner} />
        }
        {fullMode &&
            "Downloading "
        }
        {((payload?.current / payload?.total) * 100).toFixed(0)}%
    </span>;
};

const ProgressInstalling: React.FC = () => {
    return (<span>Installing</span>);
};

const ProgressVerifying: React.FC = () => {
    return (<span>Verifying</span>);
};

export default PayloadProgress;