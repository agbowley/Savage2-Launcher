import { invoke } from "@tauri-apps/api/tauri";
import { BaseTask, IBaseTask } from "./base";
import ModQueue from "@app/components/Queue/QueueEntry/Mod";
import { repositoryBaseURL } from "@app/utils/consts";
import type { ExtractedFile, InstalledModFile } from "@app/types/mods";

export class ModDownloadTask extends BaseTask implements IBaseTask {
    modId: number;
    modSlug: string;
    modName: string;
    modAuthor: string;
    modVersion: string;
    modVersionId: number;
    downloadUrl: string;
    fileName: string;

    /** Populated after extraction. */
    extractedFiles: InstalledModFile[] = [];

    onFinish?: () => void;
    onError?: (error: string) => void;
    onCancel?: () => void;

    constructor(
        profile: string,
        modId: number,
        modSlug: string,
        modName: string,
        modAuthor: string,
        modVersion: string,
        modVersionId: number,
        downloadUrl: string,
        fileName: string,
        onFinish?: () => void,
    ) {
        super("mod", profile);

        this.modId = modId;
        this.modSlug = modSlug;
        this.modName = modName;
        this.modAuthor = modAuthor;
        this.modVersion = modVersion;
        this.modVersionId = modVersionId;
        this.downloadUrl = downloadUrl;
        this.fileName = fileName;
        this.onFinish = onFinish;
    }

    get localModId(): string {
        return this.modSlug;
    }

    async start(): Promise<void> {
        // Ensure the download URL has a leading slash
        const dlPath = this.downloadUrl.startsWith("/")
            ? this.downloadUrl
            : `/${this.downloadUrl}`;
        const fullUrl = `${repositoryBaseURL}${dlPath}`;

        // Step 1: Download the mod file
        await invoke("download_mod_file", {
            profile: this.profile,
            modId: this.localModId,
            url: fullUrl,
            filename: this.fileName,
        });

        // Step 2: Extract if it's a zip
        const extracted = await invoke<ExtractedFile[]>("extract_mod_package", {
            profile: this.profile,
            modId: this.localModId,
            archiveFilename: this.fileName,
        });

        // Step 3: Build file list, hashing each extracted file
        const modsDir = await invoke<string>("get_mods_dir", { profile: this.profile });
        const modDir = `${modsDir}\\${this.localModId}`;

        this.extractedFiles = [];
        for (const file of extracted) {
            const filePath = `${modDir}\\${file.filename}`;
            let hash = "";
            try {
                hash = await invoke<string>("hash_file", { path: filePath });
            } catch {
                // Non-critical: hash failure shouldn't block install
            }
            this.extractedFiles.push({
                filename: file.filename,
                hash,
                type: file.file_type as "s2z" | "xml" | "other",
            });
        }
    }

    getQueueEntry(bannerMode: boolean, onRemove?: () => void): React.ReactNode {
        return <ModQueue modTask={this} bannerMode={bannerMode} onRemove={onRemove} />;
    }
}
