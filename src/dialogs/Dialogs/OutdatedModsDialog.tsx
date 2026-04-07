import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { CheckmarkIcon, UpgradeIcon, WarningIcon } from "@app/assets/Icons";
import Spinner from "@app/components/Spinner";
import { invoke } from "@tauri-apps/api/tauri";
import { tauriFetchJson } from "@app/utils/tauriFetch";
import { repositoryBaseURL } from "@app/utils/consts";
import { useModsStore } from "@app/stores/ModsStore";
import { useDownloadHistory } from "@app/stores/DownloadHistoryStore";
import { showDuplicateModDialog, showErrorDialog, showFileConflictDialog } from "../dialogUtil";
import { addTask } from "@app/tasks";
import { ModDownloadTask } from "@app/tasks/Processors/Mod";
import { isToolMod } from "@app/types/mods";
import type { InstalledMod, ModDetail } from "@app/types/mods";
import i18n from "@app/i18n";

export interface OutdatedModEntry {
    mod: InstalledMod;
    latestVersion: string;
    apiModId: number;
}

interface State {
    dontShowAgain: boolean;
    updatingIds: Set<number>;
    updatedIds: Set<number>;
    updatingAll: boolean;
}

export class OutdatedModsDialog extends BaseDialog<State> {
    constructor(props: Record<string, unknown>) {
        super(props);
        this.state = {
            dontShowAgain: false,
            updatingIds: new Set(),
            updatedIds: new Set(),
            updatingAll: false,
        };
    }

    getIcon() {
        return <WarningIcon />;
    }

    getIconClass() {
        return baseStyles.warning;
    }

    getTitle() {
        return <>{i18n.t("outdated_mods_title", { ns: "dialogs" })}</>;
    }

    private get outdatedMods(): OutdatedModEntry[] {
        return (this.props.outdatedMods ?? []) as OutdatedModEntry[];
    }

    private get profile(): string {
        return this.props.profile as string;
    }

    private get channel(): string {
        return this.props.channel as string;
    }

    private async updateSingleMod(entry: OutdatedModEntry): Promise<void> {
        const { mod } = entry;
        const profile = this.profile;
        const channel = this.channel;

        const detail = await tauriFetchJson<ModDetail>(
            `${repositoryBaseURL}/api/mods/${mod.apiModId}`,
        );
        const latestVersion = detail.versions.find((v) => v.isLatest) ?? detail.versions[0];
        if (!latestVersion) return;

        const { getMods, updateModVersion, toManifest } = useModsStore.getState();

        // Save content of user-modified XML files before the download overwrites staging
        const modifiedXmlBackups = new Map<string, string>();
        for (const f of mod.files) {
            if (f.modified && f.type === "xml") {
                try {
                    const content = await invoke<string>("read_mod_file_content", {
                        profile, modId: mod.id, filename: f.filename,
                    });
                    modifiedXmlBackups.set(f.filename.toLowerCase(), content);
                } catch { /* file may not exist */ }
            }
        }

        return new Promise<void>((resolve, reject) => {
            const task = new ModDownloadTask(
                profile,
                detail.id,
                detail.slug,
                detail.name,
                detail.author,
                latestVersion.version,
                latestVersion.id,
                latestVersion.downloadUrl,
                latestVersion.fileName,
                () => {
                    const isTool = isToolMod(task.extractedFiles);

                    const existingMods = getMods(profile);
                    const newHashes = new Set(task.extractedFiles.map((f) => f.hash).filter(Boolean));
                    if (newHashes.size > 0) {
                        for (const existing of existingMods) {
                            if (existing.id === mod.id) continue;
                            const match = existing.files.some((f) => f.hash && newHashes.has(f.hash));
                            if (match) {
                                showDuplicateModDialog(detail.name, existing.name);
                                invoke("delete_mod_files", { profile, modId: detail.slug }).catch(showErrorDialog);
                                reject("duplicate");
                                return;
                            }
                        }
                    }

                    const oldLoadOrder = mod.loadOrder;
                    const wasEnabled = mod.enabled;

                    const disablePromise = mod.isMap
                        ? invoke("disable_map", { profile, modId: mod.id })
                        : isTool || isToolMod(mod.files)
                            ? Promise.resolve()
                            : wasEnabled
                                ? invoke("disable_mod", { profile, modId: mod.id })
                                : Promise.resolve();

                    disablePromise.then(() => {
                        // Carry forward per-file enabled/modified state from old files
                        const oldFileState = new Map(mod.files.map((f) => [f.filename.toLowerCase(), { enabled: f.enabled, modified: f.modified }]));
                        const newFiles = task.extractedFiles.map((f) => {
                            const old = oldFileState.get(f.filename.toLowerCase());
                            return { ...f, enabled: old?.enabled ?? wasEnabled, modified: old?.modified };
                        });
                        updateModVersion(profile, mod.id, latestVersion.version, latestVersion.id, newFiles);

                        useDownloadHistory.getState().addEntry({
                            game: "Savage 2",
                            channel,
                            type: "update",
                            version: latestVersion.version,
                            previousVersion: mod.installedVersion ?? null,
                            modName: detail.name,
                        });

                        const manifest = toManifest(profile);
                        return invoke("save_mod_manifest", { profile, manifest }).then(async () => {
                            // Restore user-modified XML files
                            for (const [key, content] of modifiedXmlBackups) {
                                const match = newFiles.find((f) => f.filename.toLowerCase() === key);
                                if (match) {
                                    try {
                                        await invoke("write_mod_file_content", {
                                            profile, modId: mod.id, filename: match.filename,
                                            content, loadOrder: oldLoadOrder, isEnabled: match.enabled,
                                        });
                                    } catch { /* best effort */ }
                                }
                            }
                            if (isTool || isToolMod(mod.files)) return;
                            if (mod.isMap) {
                                return invoke("enable_map", { profile, modId: mod.id });
                            }
                            const enabledFilenames = newFiles.filter((f) => f.enabled).map((f) => f.filename);
                            if (enabledFilenames.length === 0) return;
                            return invoke<string[]>("enable_mod", {
                                profile, modId: mod.id, loadOrder: oldLoadOrder, filenames: enabledFilenames,
                            }).then((conflicts) => {
                                if (conflicts && conflicts.length > 0) {
                                    showFileConflictDialog(conflicts);
                                }
                            });
                        });
                    }).then(() => resolve()).catch((err) => {
                        showErrorDialog(err);
                        reject(err);
                    });
                },
            );

            task.onError = (err) => reject(err);
            task.onCancel = () => reject("cancelled");

            addTask(task);
        });
    }

    private handleUpdate = async (entry: OutdatedModEntry) => {
        if (this.state.updatingIds.has(entry.apiModId) || this.state.updatedIds.has(entry.apiModId)) return;

        this.setState({ updatingIds: new Set(this.state.updatingIds).add(entry.apiModId) });

        try {
            await this.updateSingleMod(entry);
            this.setState((prev) => {
                const updatingIds = new Set(prev.updatingIds);
                updatingIds.delete(entry.apiModId);
                const updatedIds = new Set(prev.updatedIds);
                updatedIds.add(entry.apiModId);
                return { updatingIds, updatedIds };
            });
        } catch {
            this.setState((prev) => {
                const updatingIds = new Set(prev.updatingIds);
                updatingIds.delete(entry.apiModId);
                return { updatingIds };
            });
        }
    };

    private handleUpdateAll = async () => {
        if (this.state.updatingAll) return;
        this.setState({ updatingAll: true });

        for (const entry of this.outdatedMods) {
            if (this.state.updatedIds.has(entry.apiModId)) continue;

            this.setState({ updatingIds: new Set(this.state.updatingIds).add(entry.apiModId) });

            try {
                await this.updateSingleMod(entry);
                this.setState((prev) => {
                    const updatingIds = new Set(prev.updatingIds);
                    updatingIds.delete(entry.apiModId);
                    const updatedIds = new Set(prev.updatedIds);
                    updatedIds.add(entry.apiModId);
                    return { updatingIds, updatedIds };
                });
            } catch {
                this.setState((prev) => {
                    const updatingIds = new Set(prev.updatingIds);
                    updatingIds.delete(entry.apiModId);
                    return { updatingIds };
                });
            }
        }

        this.setState({ updatingAll: false });
    };

    getInnerContents() {
        const mods = this.outdatedMods;
        const allUpdated = mods.every((e) => this.state.updatedIds.has(e.apiModId));
        const anyUpdating = this.state.updatingIds.size > 0;

        return (
            <div style={{ textAlign: "left", width: "100%" }}>
                <p style={{ textAlign: "center", marginBottom: 12 }}>
                    {i18n.t("outdated_mods_body", { ns: "dialogs" })}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                    {mods.map((entry) => {
                        const isUpdating = this.state.updatingIds.has(entry.apiModId);
                        const isUpdated = this.state.updatedIds.has(entry.apiModId);

                        return (
                            <div
                                key={entry.apiModId}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "8px 10px",
                                    borderRadius: 6,
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.06)",
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {entry.mod.name}
                                    </div>
                                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                                        {i18n.t("outdated_mods_version_info", {
                                            ns: "dialogs",
                                            installed: entry.mod.installedVersion,
                                            latest: entry.latestVersion,
                                        })}
                                    </div>
                                </div>
                                <div style={{ flexShrink: 0 }}>
                                    {isUpdated ? (
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#46E74F" }}>
                                            <CheckmarkIcon width={14} height={14} />
                                            {i18n.t("outdated_mods_updated", { ns: "dialogs" })}
                                        </span>
                                    ) : isUpdating ? (
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                                            <Spinner size={12} />
                                            {i18n.t("outdated_mods_updating", { ns: "dialogs" })}
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => this.handleUpdate(entry)}
                                            disabled={anyUpdating}
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 4,
                                                padding: "3px 8px",
                                                borderRadius: 4,
                                                border: "1px solid rgba(46, 217, 255, 0.25)",
                                                background: "rgba(46, 217, 255, 0.15)",
                                                color: "#2ED9FF",
                                                fontSize: 11,
                                                fontWeight: 600,
                                                fontFamily: "inherit",
                                                cursor: anyUpdating ? "not-allowed" : "pointer",
                                                opacity: anyUpdating ? 0.5 : 1,
                                            }}
                                        >
                                            <UpgradeIcon width={12} height={12} />
                                            {i18n.t("update_mod", { ns: "mods" })}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {!allUpdated && (
                    <button
                        onClick={this.handleUpdateAll}
                        disabled={anyUpdating}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            width: "100%",
                            marginTop: 10,
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "1px solid rgba(46, 217, 255, 0.25)",
                            background: "rgba(46, 217, 255, 0.15)",
                            color: "#2ED9FF",
                            fontSize: 12,
                            fontWeight: 600,
                            fontFamily: "inherit",
                            cursor: anyUpdating ? "not-allowed" : "pointer",
                            opacity: anyUpdating ? 0.5 : 1,
                        }}
                    >
                        <UpgradeIcon width={14} height={14} />
                        {i18n.t("outdated_mods_update_all", { ns: "dialogs" })}
                    </button>
                )}

                <label
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        marginTop: 14,
                        cursor: "pointer",
                        color: "rgba(255,255,255,0.55)",
                        fontSize: 12,
                    }}
                >
                    <input
                        type="checkbox"
                        checked={this.state.dontShowAgain}
                        onChange={(e) => this.setState({ dontShowAgain: e.target.checked })}
                    />
                    {i18n.t("outdated_mods_dont_warn", { ns: "dialogs" })}
                </label>
            </div>
        );
    }

    getButtons() {
        const anyUpdating = this.state.updatingIds.size > 0;
        const allUpdated = this.outdatedMods.every(e => this.state.updatedIds.has(e.apiModId));

        return (
            <>
                <Button color={ButtonColor.GRAY} onClick={() => closeDialog("cancel")} disabled={anyUpdating}>
                    {i18n.t("cancel", { ns: "common" })}
                </Button>
                <Button
                    color={ButtonColor.GREEN}
                    onClick={() => closeDialog(JSON.stringify({
                        action: "play",
                        dontShowAgain: this.state.dontShowAgain,
                    }))}
                    disabled={anyUpdating}
                >
                    {allUpdated
                        ? i18n.t("play", { ns: "launch" })
                        : i18n.t("outdated_mods_play_anyway", { ns: "dialogs" })}
                </Button>
            </>
        );
    }
}
