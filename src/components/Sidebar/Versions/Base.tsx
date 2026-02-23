import ApplicationStyles from "./styles/Application.module.css";
import SongStyles from "./styles/Song.module.css";

export enum VersionType {
    "APPLICATION",
    "SONG"
}

interface Props {
    type?: VersionType,
    icon?: React.ReactNode;
    programName?: string;
    versionChannel?: string;
    version?: string;
    status?: "installed" | "not-installed" | "update-available" | "downloading" | "queued";
}

const styleType = {
    [VersionType.APPLICATION]: ApplicationStyles,
    [VersionType.SONG]: SongStyles
};

const BaseVersion: React.FC<Props> = ({ type = VersionType.APPLICATION, icon, programName, version, versionChannel, status }: Props) => {
    const styles = styleType[type];

    return <div className={styles.selector}>
        <div className={styles.icon}>{icon}</div>
        <div className={styles.text}>
            <div className={styles.channel}>{versionChannel}</div>
            <div className={styles.name}>{programName}</div>
        </div>
        <div className={styles.version} data-status={status}>{version}</div>
    </div>;
};

export default BaseVersion;