import { invoke } from "@tauri-apps/api/tauri";
import { BaseTask, IBaseTask } from "./base";
import ReplayQueue from "@app/components/Queue/QueueEntry/Replay";

export class ReplayDownloadTask extends BaseTask implements IBaseTask {
    matchId: number;
    mapName: string;
    createdAt: string;

    onFinish?: () => void;
    onError?: (error: string) => void;
    onCancel?: () => void;

    constructor(
        profile: string,
        matchId: number,
        mapName: string,
        createdAt: string,
        onFinish?: () => void,
    ) {
        super("replay", profile);
        this.matchId = matchId;
        this.mapName = mapName;
        this.createdAt = createdAt;
        this.onFinish = onFinish;
    }

    async start(): Promise<void> {
        await invoke("download_replay_file", {
            matchId: this.matchId,
        });
    }

    getQueueEntry(bannerMode: boolean, onRemove?: () => void): React.ReactNode {
        return <ReplayQueue replayTask={this} bannerMode={bannerMode} onRemove={onRemove} />;
    }
}