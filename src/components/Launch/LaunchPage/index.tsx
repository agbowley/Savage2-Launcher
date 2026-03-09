import { S2Version } from "@app/hooks/useS2Version";
import styles from "./styles.module.css";
import { GenericBox, GenericBoxHeader } from "../../GenericBox";
import { ChangelogIcon, DateIcon, DriveIcon, InformationIcon, LinkIcon, UpdateIcon } from "@app/assets/Icons";
import TooltipWrapper from "../../TooltipWrapper";
import { intlFormatDistance } from "date-fns";
import NewsSection from "../../NewsSection";
import ModsSection from "../../ModsSection";
import { LaunchButton } from "../LaunchButton";
import { ReleaseChannels } from "@app/hooks/useS2Release";
import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useBrowsePrefsStore } from "@app/stores/BrowsePrefsStore";
import { useTranslation } from "react-i18next";
import i18n from "@app/i18n";

const INITIAL_RELEASE_DATE = new Date("2023-03-09T05:00:00.000Z");

interface Props {
    version: S2Version,
    playName: string,
    description: React.ReactNode,
    websiteUrl: string,
    icon: string,
    banner: string,
    channel: ReleaseChannels,
}

const LaunchPage: React.FC<Props> = ({ version, playName, description, websiteUrl, icon, banner, channel }: Props) => {
    const { t } = useTranslation("launch");

    // If there isn't a version, something went wrong
    if (!version) {
        return <p>{t("error_no_version")}</p>;
    }

    const location = useLocation();
    const activeTab = useBrowsePrefsStore((s) => s.activeTab);
    const setActiveTab = useBrowsePrefsStore((s) => s.setActiveTab);
    const CreatedDate = version.releaseDate ? new Date(version.releaseDate) : INITIAL_RELEASE_DATE;

    // Allow location.state override (e.g. back from mod detail page)
    useEffect(() => {
        const stateTab = (location.state as { activeTab?: string } | null)?.activeTab;
        if (stateTab === "mods" || stateTab === "news") {
            setActiveTab(stateTab);
        }
    }, [location.state, setActiveTab]);

    return <>
        <div className={styles.header} style={{backgroundImage: `url("${banner}")`}}>
            <div className={styles.icon_container}>
                <img className={styles.icon} src={icon} alt="Savage 2" />
                <div className={styles.game_info}>
                    <span className={styles.game_name}>
                        Savage 2
                    </span>
                    <div className={styles.version_badge}>
                        {version.installedVersion ?? version.latestVersion ?? playName}
                    </div>
                </div>
            </div>
            <div className={styles.actions}>{playName}</div>
        </div>
        <div className={styles.main}>
            <div className={styles.content_area}>
                <div className={styles.tab_bar}>
                    <button
                        className={`${styles.tab_button} ${activeTab === "news" ? styles.tab_active : ""}`}
                        onClick={() => setActiveTab("news")}
                    >
                        {t("news")}
                    </button>
                    <button
                        className={`${styles.tab_button} ${activeTab === "mods" ? styles.tab_active : ""}`}
                        onClick={() => setActiveTab("mods")}
                    >
                        {t("mods")}
                    </button>
                </div>
                {activeTab === "news" ? <NewsSection /> : <ModsSection channel={channel} />}
            </div>
            <div className={styles.sidebar}>
                <LaunchButton style={{ width: "100%" }} version={version} playName={""} />
                <GenericBox style={{ background: "#ffffff33", borderRadius: 15 }}>
                    <GenericBoxHeader>
                        <InformationIcon />
                        {t("savage2_info", { playName })}
                    </GenericBoxHeader>

                    {description}

                    <div className={styles.info_list}>
                        {version.installedVersion && (
                            <TooltipWrapper
                                text={version.latestVersion
                                    ? (version.installedVersion === version.latestVersion
                                        ? t("up_to_date")
                                        : t("update_available_version", { version: version.latestVersion }))
                                    : t("checking_updates")}
                                className={styles.info_entry}>
                                <UpdateIcon />
                                {t("installed_version", { version: version.installedVersion })}
                                {version.latestVersion && version.installedVersion !== version.latestVersion && (
                                    <span className={styles.update_badge}>{t("update_available")}</span>
                                )}
                            </TooltipWrapper>
                        )}
                        {version.installPath && (
                            <TooltipWrapper
                                text={t("install_location", { path: version.installPath })}
                                className={`${styles.info_entry} ${styles.clickable}`}
                                onClick={() => version.revealFolder()}>
                                <DriveIcon />
                                <span className={styles.path_text}>{version.installPath}</span>
                            </TooltipWrapper>
                        )}
                        <TooltipWrapper
                            text={t("latest_version")}
                            className={styles.info_entry}>
                            <InformationIcon />
                            {t("latest_display", { version: version.latestVersion || t("checking") })}
                        </TooltipWrapper>
                        <TooltipWrapper
                            text={t("release_date_distance", { distance: intlFormatDistance(CreatedDate, new Date()) })}
                            className={styles.info_entry}>

                            <DateIcon />
                            {new Intl.DateTimeFormat(i18n.language, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            }).format(CreatedDate)}
                        </TooltipWrapper>
                        <Link to={`/changelog/${channel}`} className={`${styles.info_entry} ${styles.clickable}`}>
                            <ChangelogIcon />
                            {t("view_changelog")}
                        </Link>
                        <a className={styles.info_entry} href={websiteUrl} target="_blank" rel="noreferrer">
                            <LinkIcon />
                            {t("official_website")}
                        </a>
                    </div>
                </GenericBox>
            </div>
        </div>
    </>;
};

export default LaunchPage;