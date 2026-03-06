import { ModDownloadTask } from "@app/tasks/Processors/Mod";
import BaseQueue from "./base";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";

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

const channelNames: Record<string, string> = {
    "stable": "Community Edition",
    "nightly": "Beta Test Client",
    "legacy": "Legacy Client",
};

const ModQueue: React.FC<Props> = ({ modTask, bannerMode, onRemove }: Props) => {
    const icon = channelIcons[modTask.profile] || StableS2Icon;
    const channelLabel = channelNames[modTask.profile] ?? modTask.profile;

    return <BaseQueue
        name={`${channelLabel} — ${modTask.modName}`}
        icon={<img src={icon} />}
        versionChannel={`by ${modTask.modAuthor}`}
        taskType="download"
        isMod
        bannerMode={bannerMode}
        onRemove={onRemove}
    />;
};

export default ModQueue;
