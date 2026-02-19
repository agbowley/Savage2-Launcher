import { S2Task } from "@app/tasks/Processors/S2";
import BaseQueue from "./base";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";
import { ReleaseChannels } from "@app/hooks/useS2Release";

interface Props {
    s2Task: S2Task,
    bannerMode: boolean,
    onRemove?: () => void,
}

const S2Queue: React.FC<Props> = ({ s2Task, bannerMode, onRemove }: Props) => {
    const channelIconPath: { [key in ReleaseChannels]: string } = {
        "stable": StableS2Icon,
        "nightly": NightlyS2Icon,
        "legacy": LegacyS2Icon
    };

    function getChannelDisplayName() {
        switch (s2Task.channel) {
            case "stable":
                return "Community Edition";
            case "nightly":
                return "Beta Test Client";
            case "legacy":
                return "Legacy Client";
        }
    }

    return <BaseQueue
        name="Savage 2"
        icon={<img src={channelIconPath[s2Task.channel]} />}
        versionChannel={getChannelDisplayName()}
        bannerMode={bannerMode}
        onRemove={onRemove}
    />;
};

export default S2Queue;