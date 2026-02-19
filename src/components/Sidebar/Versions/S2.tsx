import { ReleaseChannels, useS2Release } from "@app/hooks/useS2Release";
import { S2States, useS2Version } from "@app/hooks/useS2Version";
import BaseVersion from "./Base";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";
import { NavLink } from "react-router-dom";

interface Props {
    channel: ReleaseChannels;
}

const S2Version: React.FC<Props> = ({ channel }: Props) => {
    const { data: releaseData } = useS2Release(channel);
    const { state, installedVersion, latestVersion } = useS2Version(releaseData, channel);

    function getChannelIcon() {
        switch (channel) {
            case "stable":
                return StableS2Icon;
            case "nightly":
                return NightlyS2Icon;
            case "legacy":
                return LegacyS2Icon;
        }
    }

    function getChannelDisplayName() {
        switch (channel) {
            case "stable":
                return "Community Edition";
            case "nightly":
                return "Beta Test Client";
            case "legacy":
                return "Legacy Client";
        }
    }

    function getProgramName() {
        switch (channel) {
            case "stable":
                return "Savage 2: CE";
            case "nightly":
                return "Savage 2: CE - Beta";
            case "legacy":
                return "Savage 2 - A Tortured Soul";
        }
    }

    function getStatus(): "installed" | "not-installed" | "update-available" | "downloading" | undefined {
        switch (state) {
            case S2States.AVAILABLE:
            case S2States.PLAYING:
                return "installed";
            case S2States.DOWNLOADING:
                return "downloading";
            case S2States.NEW_UPDATE:
                return installedVersion ? "update-available" : "not-installed";
            default:
                return undefined;
        }
    }

    return (
        <NavLink to={"/S2/" + channel}>
            <BaseVersion
                icon={<img src={getChannelIcon()} alt="Savage 2" />}
                programName={getProgramName()}
                versionChannel={getChannelDisplayName()}
                version={installedVersion ?? latestVersion ?? undefined}
                status={getStatus()}
            />
        </NavLink>
    );
};

export default S2Version;
