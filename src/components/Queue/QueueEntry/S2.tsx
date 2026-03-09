import { S2Task, S2Download, S2PatchUpdate, S2Uninstall } from "@app/tasks/Processors/S2";
import BaseQueue from "./base";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";
import { ReleaseChannels } from "@app/hooks/useS2Release";
import { useTranslation } from "react-i18next";

interface Props {
    s2Task: S2Task,
    bannerMode: boolean,
    onRemove?: () => void,
}

function getTaskType(task: S2Task): "download" | "update" | "uninstall" | "repair" {
    if (task instanceof S2Download) return "download";
    if (task instanceof S2PatchUpdate) return "update";
    if (task instanceof S2Uninstall) return "uninstall";
    return "download";
}

const S2Queue: React.FC<Props> = ({ s2Task, bannerMode, onRemove }: Props) => {
    const { t } = useTranslation("launch");
    const channelIconPath: { [key in ReleaseChannels]: string } = {
        "stable": StableS2Icon,
        "nightly": NightlyS2Icon,
        "legacy": LegacyS2Icon
    };

    function getChannelDisplayName() {
        switch (s2Task.channel) {
            case "stable":
                return t("community_edition");
            case "nightly":
                return t("beta_test_client");
            case "legacy":
                return t("legacy_client");
        }
    }

    return <BaseQueue
        name="Savage 2"
        icon={<img src={channelIconPath[s2Task.channel]} />}
        versionChannel={getChannelDisplayName()}
        taskType={getTaskType(s2Task)}
        bannerMode={bannerMode}
        onRemove={onRemove}
    />;
};

export default S2Queue;