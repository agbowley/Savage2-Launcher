import { S2Version } from "@app/hooks/useS2Version";
import styles from "./styles.module.css";
import { GenericBox, GenericBoxHeader } from "../../GenericBox";
import { DateIcon, DriveIcon, InformationIcon, LinkIcon, SettingsIcon, UpdateIcon } from "@app/assets/Icons";
import TooltipWrapper from "../../TooltipWrapper";
import { intlFormatDistance } from "date-fns";
import NewsSection from "../../NewsSection";
import { LaunchButton } from "../LaunchButton";

const INITIAL_RELEASE_DATE = new Date("2023-03-09T05:00:00.000Z");

interface Props {
    version: S2Version,
    releaseTag: string,
    playName: string,
    description: React.ReactNode,
    websiteUrl: string,
    icon: string,
    banner: string,
    created_at: string
}

const LaunchPage: React.FC<Props> = ({ version, releaseTag, playName, description, websiteUrl, icon, banner, created_at }: Props) => {
    // If there isn't a version, something went wrong
    if (!version) {
        return <p>Error: No version.</p>;
    }

    const CreatedDate = created_at ? new Date(created_at) : INITIAL_RELEASE_DATE;

    return <>
        <div className={styles.header} style={{backgroundImage: `url("${banner}")`}}>
            <div className={styles.icon_container}>
                <img className={styles.icon} src={icon} alt="Savage 2" />
                <div className={styles.game_info}>
                    <span className={styles.game_name}>
                        Savage 2
                    </span>
                    <div className={styles.version_badge}>
                        {releaseTag}
                    </div>
                </div>
            </div>
            <div className={styles.actions}>
                {playName}
                <button className={styles.settings_button} onClick={() => version.changeInstallLocation()} title="Change Install Location">
                    <SettingsIcon width={18} height={18} />
                </button>
            </div>
        </div>
        <div className={styles.main}>
            <NewsSection />
            <div className={styles.sidebar}>
                <LaunchButton style={{ width: "100%" }} version={version} playName={""} />
                <GenericBox style={{ background: "#ffffff33", borderRadius: 15 }}>
                    <GenericBoxHeader>
                        <InformationIcon />
                        Savage 2 - {playName}
                    </GenericBoxHeader>

                    {description}

                    <div className={styles.info_list}>
                        {version.installedVersion && (
                            <TooltipWrapper
                                text={version.installedVersion === version.latestVersion
                                    ? "You are up to date!"
                                    : `Update available: ${version.latestVersion}`}
                                className={styles.info_entry}>
                                <UpdateIcon />
                                Installed: {version.installedVersion}
                                {version.installedVersion !== version.latestVersion && (
                                    <span className={styles.update_badge}>Update Available</span>
                                )}
                            </TooltipWrapper>
                        )}
                        {version.installPath && (
                            <TooltipWrapper
                                text={version.installPath}
                                className={`${styles.info_entry} ${styles.clickable}`}
                                onClick={() => version.revealFolder()}>
                                <DriveIcon />
                                <span className={styles.path_text}>{version.installPath}</span>
                            </TooltipWrapper>
                        )}
                        <TooltipWrapper
                            text={"Latest Version"}
                            className={styles.info_entry}>
                            <InformationIcon />
                            Latest: {releaseTag}
                        </TooltipWrapper>
                        <TooltipWrapper
                            text={`Initial Release Date (${intlFormatDistance(CreatedDate, new Date())})`}
                            className={styles.info_entry}>

                            <DateIcon />
                            {new Intl.DateTimeFormat("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            }).format(CreatedDate)}
                        </TooltipWrapper>
                        <a className={styles.info_entry} href={websiteUrl} target="_blank" rel="noreferrer">
                            <LinkIcon />
                            Official Website
                        </a>
                    </div>
                </GenericBox>
                {version.downloadLocation && (
                    <GenericBox style={{ background: "#ffffff33", borderRadius: 15 }}>
                        <GenericBoxHeader>
                            <DriveIcon />
                            Install Location
                        </GenericBoxHeader>
                        <div className={styles.folder_row}
                            onClick={() => version.changeInstallLocation()}
                            title="Click to change install location">
                            <DriveIcon width={14} height={14} />
                            <span className={styles.folder_path}>{version.downloadLocation}</span>
                        </div>
                    </GenericBox>
                )}
            </div>
        </div>
    </>;
};

export default LaunchPage;