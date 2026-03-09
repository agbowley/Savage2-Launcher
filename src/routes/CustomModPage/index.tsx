import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import styles from "../ModPage/ModPage.module.css";
import { useModsStore } from "@app/stores/ModsStore";
import { BackIcon, DriveIcon } from "@app/assets/Icons";
import { showDeleteModDialog, showErrorDialog, showFileConflictDialog } from "@app/dialogs/dialogUtil";
import type { ReleaseChannels } from "@app/hooks/useS2Release";
import { useTranslation } from "react-i18next";
import i18n from "@app/i18n";

function channelToProfile(channel: ReleaseChannels): string {
    switch (channel) {
        case "stable": return "latest";
        case "nightly": return "beta";
        case "legacy": return "legacy";
    }
}

function formatDate(iso: string): string {
    return new Intl.DateTimeFormat(i18n.language, {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(new Date(iso));
}

const CustomModPage: React.FC = () => {
    const { t } = useTranslation("mods");
    const { modId } = useParams<{ modId: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const channel = (searchParams.get("channel") ?? "stable") as ReleaseChannels;
    const profile = channelToProfile(channel);

    const mod = useModsStore((s) => modId ? s.getMod(profile, modId) : undefined);
    const setModEnabled = useModsStore((s) => s.setModEnabled);
    const removeMod = useModsStore((s) => s.removeMod);
    const toManifest = useModsStore((s) => s.toManifest);

    const [modFolderPath, setModFolderPath] = useState<string | null>(null);

    useEffect(() => {
        if (!mod) {
            setModFolderPath(null);
            return;
        }
        invoke("get_mod_folder_path", { profile, modId: mod.id })
            .then((path) => setModFolderPath(path as string))
            .catch(() => setModFolderPath(null));
    }, [mod?.id, profile]);

    const handleToggleEnabled = useCallback(async () => {
        if (!mod) return;
        const newEnabled = !mod.enabled;
        try {
            if (newEnabled) {
                const conflicts = await invoke<string[]>("enable_mod", { profile, modId: mod.id, loadOrder: mod.loadOrder });
                if (conflicts && conflicts.length > 0) {
                    await showFileConflictDialog(conflicts);
                }
            } else {
                await invoke("disable_mod", { profile, modId: mod.id });
            }
            setModEnabled(profile, mod.id, newEnabled);
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            console.error("Failed to toggle mod:", err);
        }
    }, [mod, profile, setModEnabled, toManifest]);

    const handleDelete = useCallback(async () => {
        if (!mod) return;
        const result = await showDeleteModDialog(mod.name, mod.files.length);
        if (!result) return;

        try {
            if (result === "delete-files") {
                await invoke("disable_mod", { profile, modId: mod.id });
                await invoke("delete_mod_files", { profile, modId: mod.id });
            } else {
                if (mod.enabled) {
                    await invoke("restore_mod_filenames", {
                        profile, modId: mod.id, loadOrder: mod.loadOrder,
                    });
                }
                await invoke("delete_mod_files", { profile, modId: mod.id });
            }

            removeMod(profile, mod.id);
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
            navigate(`/s2/${channel}`, { state: { activeTab: "mods" } });
        } catch (err) {
            console.error("Failed to delete custom mod:", err);
        }
    }, [mod, profile, removeMod, toManifest, navigate, channel]);

    if (!mod) {
        return (
            <div className={styles.page}>
                <div className={styles.loading}>{t("mod_not_found")}</div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            {/* Back navigation */}
            <div className={styles.back_bar}>
                <button className={styles.back_button} onClick={() => navigate(`/s2/${channel}`, { state: { activeTab: "mods" } })}>
                    <BackIcon />
                    {t("back", { ns: "common" })}
                </button>
            </div>

            <div className={styles.content}>
                {/* ====== Main column ====== */}
                <div className={styles.main_col}>
                    {/* Header */}
                    <div className={styles.header}>
                        <span className={styles.title}>{mod.name}</span>
                        <span className={styles.subtitle}>
                            {t("imported_mod")}
                            {mod.files.length > 1 && <span>&middot; {mod.files.length} {t("files_section")}</span>}
                        </span>
                    </div>

                    {/* Installed files */}
                    {mod.files.length > 0 && (
                        <div className={styles.versions_section}>
                            <span className={styles.section_heading}>{t("files_section")}</span>
                            <div className={styles.files_list}>
                                {mod.files.map((f) => (
                                    <div key={f.filename} className={styles.file_entry}>
                                        <span className={styles.file_icon}>📄</span>
                                        <span className={styles.file_name}>{f.filename}</span>
                                        <span>({f.type})</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ====== Side column ====== */}
                <div className={styles.side_col}>
                    {/* Actions card */}
                    <div className={styles.side_card}>
                        <div className={styles.action_row}>
                            <button
                                className={`${styles.install_button} ${mod.enabled ? styles.install_button_enabled : styles.install_button_disabled_state}`}
                                onClick={handleToggleEnabled}
                            >
                                {mod.enabled ? t("enabled", { ns: "common" }) : t("disabled", { ns: "common" })}
                            </button>
                        </div>
                        <div className={styles.action_row}>
                            <button
                                className={`${styles.install_button} ${styles.install_button_danger}`}
                                onClick={handleDelete}
                            >
                                {t("remove", { ns: "common" })}
                            </button>
                        </div>
                    </div>

                    {/* Info card */}
                    <div className={styles.side_card}>
                        <span className={styles.side_card_title}>{t("details")}</span>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>{t("type_label")}</span>
                            <span className={styles.info_value}>{t("imported_value")}</span>
                        </div>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>{t("files_section")}</span>
                            <span className={styles.info_value}>{mod.files.length}</span>
                        </div>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>{t("load_order_label")}</span>
                            <span className={styles.info_value}>#{mod.loadOrder}</span>
                        </div>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>{t("status_label")}</span>
                            <span className={styles.info_value}>{mod.enabled ? t("active_status") : t("inactive_status")}</span>
                        </div>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>{t("installed_label")}</span>
                            <span className={styles.info_value}>{formatDate(mod.installedAt)}</span>
                        </div>
                        {modFolderPath && (
                            <div
                                className={`${styles.info_row} ${styles.clickable_row}`}
                                onClick={() => invoke("reveal_mod_folder", { profile, modId: mod.id }).catch(showErrorDialog)}
                                title={modFolderPath}
                            >
                                <DriveIcon />
                                <span className={styles.info_value} style={{ wordBreak: "break-all" }}>
                                    {modFolderPath}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CustomModPage;
