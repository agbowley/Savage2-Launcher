import { invoke } from "@tauri-apps/api/tauri";
import { BaseTask, IBaseTask } from "./base";
import S2Queue from "@app/components/Queue/QueueEntry/S2";
import { ReleaseChannels } from "@app/hooks/useS2Release";

export abstract class S2Task extends BaseTask {
    channel: ReleaseChannels;
    profile: string;
    onFinish: () => void;
    onError?: (error: string) => void;
    onCancel?: () => void;

    constructor(channel: ReleaseChannels, profile: string, onFinish: () => void) {
        super("Savage 2", profile);

        this.channel = channel;
        this.profile = profile;
        this.onFinish = onFinish;
    }

    getQueueEntry(bannerMode: boolean, onRemove?: () => void): React.ReactNode {
        return <S2Queue s2Task={this} bannerMode={bannerMode} onRemove={onRemove} />;
    }
}

export class S2Download extends S2Task implements IBaseTask {
    zipUrl: string;
    sigUrl?: string;

    constructor(zipUrl: string, sigUrl: string | undefined, channel: ReleaseChannels,
        profile: string, onFinish: () => void) {

        super(channel, profile, onFinish);

        this.zipUrl = zipUrl;
        this.sigUrl = sigUrl;
    }

    async start(): Promise<void> {
        let sigUrls: string[] = [];
        if (this.sigUrl != null) {
            sigUrls = [ this.sigUrl ];
        }

        return await invoke("download_and_install", {
            appName: "Savage 2",
            profile: this.profile,
            zipUrls: [ this.zipUrl ],
            sigUrls: sigUrls,
        });
    }
}

export class S2Uninstall extends S2Task implements IBaseTask {
    manifestUrl: string;

    constructor(manifestUrl: string, channel: ReleaseChannels, profile: string, onFinish: () => void) {
        super(channel, profile, onFinish);
        this.manifestUrl = manifestUrl;
    }

    async start(): Promise<void> {
        return await invoke("uninstall", {
            appName: "Savage 2",
            profile: this.profile,
            manifestUrl: this.manifestUrl,
        });
    }
}

interface PatchResult {
    repaired: string[];
    skipped: string[];
}

export class S2PatchUpdate extends S2Task implements IBaseTask {
    manifestUrl: string;
    repairedFiles: string[] = [];
    skippedFiles: string[] = [];

    constructor(manifestUrl: string, channel: ReleaseChannels,
        profile: string, onFinish: () => void) {

        super(channel, profile, onFinish);
        this.manifestUrl = manifestUrl;
    }

    async start(): Promise<void> {
        const result = await invoke<PatchResult>("patch_update", {
            appName: "Savage 2",
            profile: this.profile,
            manifestUrl: this.manifestUrl,
        });
        this.repairedFiles = result.repaired;
        this.skippedFiles = result.skipped;
    }
}