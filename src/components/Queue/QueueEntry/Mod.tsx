import { ModDownloadTask } from "@app/tasks/Processors/Mod";
import BaseQueue from "./base";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";
import { useTranslation } from "react-i18next";

interface Props {
    modTask: ModDownloadTask;
    bannerMode: boolean;
    onRemove?: () => void;
}

const channelIcons: Record<string, string> = {
    "stable": StableS2Icon,
    "nightly": NightlyS2Icon,
    "legacy": LegacyS2Icon,
};

const ModQueue: React.FC<Props> = ({ modTask, bannerMode, onRemove }: Props) => {
    const { t } = useTranslation();
    const tLaunch = useTranslation("launch").t;
    const icon = channelIcons[modTask.profile] || StableS2Icon;
    const channelNames: Record<string, string> = {
        "stable": tLaunch("community_edition"),
        "nightly": tLaunch("beta_test_client"),
        "legacy": tLaunch("legacy_client"),
    };
    const channelLabel = channelNames[modTask.profile] ?? modTask.profile;

    return <BaseQueue
        name={`${channelLabel} \u2014 ${modTask.modName}`}
        icon={<img src={icon} />}
        versionChannel={t("by_prefix", { name: modTask.modAuthor })}
        taskType="download"
        isMod
        bannerMode={bannerMode}
        onRemove={onRemove}
    />;
};

export default ModQueue;
