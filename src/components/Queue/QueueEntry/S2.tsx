import { S2Task } from "@app/tasks/Processors/S2";
import BaseQueue from "./base";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import { ReleaseChannels } from "@app/hooks/useS2Release";

interface Props {
    s2Task: S2Task,
    bannerMode: boolean,
}

const S2Queue: React.FC<Props> = ({ s2Task, bannerMode }: Props) => {
    const channelIconPath: { [key in ReleaseChannels]: string } = {
        "stable": StableS2Icon,
        "nightly": NightlyS2Icon
    };

    function getChannelDisplayName() {
        switch (s2Task.channel) {
            case "stable":
                return "Community Edition";
            case "nightly":
                return "Beta Test";
        }
    }

    return <BaseQueue
        name="Savage 2"
        icon={<img src={channelIconPath[s2Task.channel]} />}
        version={s2Task.version}
        versionChannel={getChannelDisplayName()}
        bannerMode={bannerMode}
    />;
};

export default S2Queue;