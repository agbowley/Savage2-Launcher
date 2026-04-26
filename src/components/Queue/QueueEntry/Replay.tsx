import BaseQueue from "./base";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";
import { ReplayDownloadTask } from "@app/tasks/Processors/Replay";
import { useTranslation } from "react-i18next";

interface Props {
    replayTask: ReplayDownloadTask;
    bannerMode: boolean;
    onRemove?: () => void;
}

const channelIcons: Record<string, string> = {
    stable: StableS2Icon,
    nightly: NightlyS2Icon,
    legacy: LegacyS2Icon,
    latest: StableS2Icon,
    beta: NightlyS2Icon,
};

const ReplayQueue: React.FC<Props> = ({ replayTask, bannerMode, onRemove }: Props) => {
    const { t } = useTranslation("launch");
    const tLaunch = useTranslation("launch").t;
    const icon = channelIcons[replayTask.profile] || StableS2Icon;
    const channelNames: Record<string, string> = {
        stable: tLaunch("community_edition"),
        nightly: tLaunch("beta_test_client"),
        legacy: tLaunch("legacy_client"),
        latest: tLaunch("community_edition"),
        beta: tLaunch("beta_test_client"),
    };
    const channelLabel = channelNames[replayTask.profile] ?? replayTask.profile;

    return <BaseQueue
        name={`${channelLabel} \u2014 ${t("match_id_label", { id: replayTask.matchId })}`}
        icon={<img src={icon} />}
        versionChannel={replayTask.mapName}
        taskType="replay"
        bannerMode={bannerMode}
        onRemove={onRemove}
    />;
};

export default ReplayQueue;