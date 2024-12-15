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
    const { state } = useS2Version(releaseData, channel);

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
                return "Savage 2";
        }
    }

    return (
        <NavLink to={"/S2/" + channel}>
            <BaseVersion
                icon={<img src={getChannelIcon()} alt="Savage 2" />}
                programName={releaseData?.name ? releaseData?.name : "Savage 2"}
                versionChannel={getChannelDisplayName()}
                version={releaseData?.tag_name}
                updateAvailable={state === S2States.NEW_UPDATE}
                created_at={releaseData?.created_at}
            />
        </NavLink>
    );
};

export default S2Version;
