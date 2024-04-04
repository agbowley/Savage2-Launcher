import { S2Version } from "@app/hooks/useS2Version";
import styles from "./styles.module.css";
import { GenericBox, GenericBoxHeader } from "../../GenericBox";
import { DateIcon, InformationIcon, LinkIcon } from "@app/assets/Icons";
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
            <div className={styles.actions}>{playName}</div>
        </div>
        <div className={styles.main}>
            <NewsSection categoryFilter="s2_launcher" />
            <div className={styles.sidebar}>
                <LaunchButton style={{ width: "100%" }} version={version} playName={""} />
                <GenericBox style={{ background: "#ffffff33", borderRadius: 15 }}>
                    <GenericBoxHeader>
                        <InformationIcon />
                        Savage 2 - {playName}
                    </GenericBoxHeader>

                    {description}

                    <div className={styles.info_list}>
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
            </div>
        </div>
    </>;
};

export default LaunchPage;