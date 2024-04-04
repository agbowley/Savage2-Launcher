import { invoke } from "@tauri-apps/api/tauri";
import { BaseTask, IBaseTask } from "./base";
import S2Queue from "@app/components/Queue/QueueEntry/S2";
import { ReleaseChannels } from "@app/hooks/useS2Release";

export abstract class S2Task extends BaseTask {
    channel: ReleaseChannels;
    version: string;
    profile: string;
    onFinish: () => void;

    constructor(channel: ReleaseChannels, version: string, profile: string, onFinish: () => void) {
        super("Savage 2", profile);

        this.channel = channel;
        this.version = version;
        this.profile = profile;
        this.onFinish = onFinish;
    }

    getQueueEntry(bannerMode: boolean): React.ReactNode {
        return <S2Queue s2Task={this} bannerMode={bannerMode} />;
    }
}

export class S2Download extends S2Task implements IBaseTask {
    zipUrl: string;
    sigUrl?: string;

    constructor(zipUrl: string, sigUrl: string | undefined, channel: ReleaseChannels, version: string,
        profile: string, onFinish: () => void) {

        super(channel, version, profile, onFinish);

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
            version: this.version,
            profile: this.profile,
            zipUrls: [ this.zipUrl ],
            sigUrls: sigUrls,
        });
    }
}

export class S2Uninstall extends S2Task implements IBaseTask {
    constructor(channel: ReleaseChannels, version: string, profile: string, onFinish: () => void) {
        super(channel, version, profile, onFinish);
    }

    async start(): Promise<void> {
        return await invoke("uninstall", {
            appName: "Savage 2",
            version: this.version,
            profile: this.profile
        });
    }
}