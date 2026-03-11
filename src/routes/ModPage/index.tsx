import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import styles from "./ModPage.module.css";
import { useModDetail } from "@app/hooks/useModDetail";
import { useModsStore } from "@app/stores/ModsStore";
import { BackIcon, DownloadIcon, DriveIcon, CheckmarkIcon, UpgradeIcon } from "@app/assets/Icons";
import { repositoryBaseURL } from "@app/utils/consts";
import CachedImage from "@app/components/CachedImage";
import { addTask } from "@app/tasks";
import { ModDownloadTask } from "@app/tasks/Processors/Mod";
import { showDuplicateModDialog, showErrorDialog, showFileConflictDialog, showModifiedXmlWarning, showXmlEditorDialog } from "@app/dialogs/dialogUtil";
import { useDownloadHistory } from "@app/stores/DownloadHistoryStore";
import type { ReleaseChannels } from "@app/hooks/useS2Release";
import type { ModVersion, InstalledMod, InstalledModFile } from "@app/types/mods";
import { isMapMod, isToolMod } from "@app/types/mods";
import { useTranslation } from "react-i18next";
import i18n from "@app/i18n";

function channelToProfile(channel: ReleaseChannels): string {
    switch (channel) {
        case "stable": return "latest";
        case "nightly": return "beta";
        case "legacy": return "legacy";
    }
}

/**
 * After removing a mod from the store (which recompacts load orders),
 * rename .s2z files in /game/ for any enabled non-map mod whose load order changed.
 */
async function reorderAfterRemoval(
    profile: string,
    oldMods: InstalledMod[],
    newMods: InstalledMod[],
) {
    const newOrderById = new Map(newMods.map((m) => [m.id, m.loadOrder]));
    for (const old of oldMods) {
        if (old.isMap || !old.enabled || old.loadOrder === 0) continue;
        const newOrder = newOrderById.get(old.id);
        if (newOrder !== undefined && newOrder !== old.loadOrder) {
            await invoke("reorder_mod", {
                profile,
                modId: old.id,
                oldLoadOrder: old.loadOrder,
                newLoadOrder: newOrder,
            });
        }
    }
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
    return new Intl.DateTimeFormat(i18n.language, {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(new Date(iso));
}

const ModPage: React.FC = () => {
    const { t } = useTranslation("mods");
    const { modId } = useParams<{ modId: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const channel = (searchParams.get("channel") ?? "stable") as ReleaseChannels;
    const profile = channelToProfile(channel);
    const numModId = modId ? parseInt(modId, 10) : null;

    const { data: mod, isLoading, error } = useModDetail(numModId);

    // ---- Store ----
    const installedMod = useModsStore((s) => numModId !== null ? s.getModByApiId(profile, numModId) : undefined);
    const addMod = useModsStore((s) => s.addMod);
    const setModEnabled = useModsStore((s) => s.setModEnabled);
    const setFileEnabled = useModsStore((s) => s.setFileEnabled);
    const removeMod = useModsStore((s) => s.removeMod);
    const updateModVersion = useModsStore((s) => s.updateModVersion);
    const toManifest = useModsStore((s) => s.toManifest);
    const getMods = useModsStore((s) => s.getMods);

    // ---- Local state ----
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);
    const [installing, setInstalling] = useState(false);
    const [modFolderPath, setModFolderPath] = useState<string | null>(null);

    const isInstalled = !!installedMod;

    // Fetch mod folder path when installed
    useEffect(() => {
        if (!isInstalled || !installedMod) {
            setModFolderPath(null);
            return;
        }
        invoke("get_mod_folder_path", { profile, modId: installedMod.id })
            .then((path) => setModFolderPath(path as string))
            .catch(() => setModFolderPath(null));
    }, [isInstalled, installedMod?.id, profile]);

    const sortedImages = useMemo(() => {
        if (!mod) return [];
        return [...mod.images].sort((a, b) => a.displayOrder - b.displayOrder);
    }, [mod]);

    // ---- Gallery drag-to-scroll ----
    const galleryRef = useRef<HTMLDivElement>(null);
    const dragState = useRef({ isDown: false, startX: 0, scrollLeft: 0, hasDragged: false });

    const handleGalleryMouseDown = useCallback((e: React.MouseEvent) => {
        const el = galleryRef.current;
        if (!el) return;
        dragState.current = { isDown: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft, hasDragged: false };
        el.style.cursor = "grabbing";
    }, []);

    const handleGalleryMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragState.current.isDown) return;
        e.preventDefault();
        const el = galleryRef.current;
        if (!el) return;
        const x = e.pageX - el.offsetLeft;
        const walk = (x - dragState.current.startX) * 1.5;
        if (Math.abs(walk) > 3) dragState.current.hasDragged = true;
        el.scrollLeft = dragState.current.scrollLeft - walk;
    }, []);

    const handleGalleryMouseUp = useCallback(() => {
        dragState.current.isDown = false;
        const el = galleryRef.current;
        if (el) el.style.cursor = "grab";
    }, []);

    // ---- Install handler ----
    const isMap = mod ? isMapMod(mod.tags) : false;

    const handleInstall = useCallback(async (version: ModVersion) => {
        if (!mod || installing) return;
        setInstalling(true);

        const task = new ModDownloadTask(
            profile,
            mod.id,
            mod.slug,
            mod.name,
            mod.author,
            version.version,
            version.id,
            version.downloadUrl,
            version.fileName,
            () => {
                // On finish: check for duplicate files in existing mods
                const existingMods = getMods(profile);
                const newHashes = new Set(task.extractedFiles.map((f) => f.hash).filter(Boolean));
                if (newHashes.size > 0) {
                    for (const existing of existingMods) {
                        // Skip the mod being upgraded
                        if (installedMod && existing.id === installedMod.id) continue;
                        const match = existing.files.some((f) => f.hash && newHashes.has(f.hash));
                        if (match) {
                            showDuplicateModDialog(mod.name, existing.name);
                            // Clean up downloaded files
                            invoke("delete_mod_files", { profile, modId: mod.slug }).catch(showErrorDialog);
                            setInstalling(false);
                            return;
                        }
                    }
                }

                const isTool = isToolMod(task.extractedFiles);
                const isUpgrade = !!installedMod;

                if (isUpgrade) {
                    // UPGRADE PATH: preserve load order position
                    const oldLoadOrder = installedMod.loadOrder;
                    const wasEnabled = installedMod.enabled;

                    // Disable old files from /game/ first
                    const disablePromise = installedMod.isMap
                        ? invoke("disable_map", { profile, modId: installedMod.id })
                        : isTool || isToolMod(installedMod.files)
                            ? Promise.resolve()
                            : wasEnabled
                                ? invoke("disable_mod", { profile, modId: installedMod.id })
                                : Promise.resolve();

                    disablePromise.then(() => {
                        // Update store entry (preserves loadOrder, enabled, position)
                        const newFiles = task.extractedFiles.map((f) => ({ ...f, enabled: wasEnabled }));
                        updateModVersion(profile, installedMod.id, version.version, version.id, newFiles);

                        // Log to download history
                        useDownloadHistory.getState().addEntry({
                            game: "Savage 2",
                            channel,
                            type: "update",
                            version: version.version,
                            previousVersion: installedMod.installedVersion ?? null,
                            modName: mod!.name,
                        });

                        // Persist manifest, then re-enable at the same load order
                        const manifest = toManifest(profile);
                        return invoke("save_mod_manifest", { profile, manifest }).then(() => {
                            if (isTool || isToolMod(installedMod.files)) return;
                            if (isMap) {
                                return invoke("enable_map", { profile, modId: installedMod.id });
                            }
                            if (!wasEnabled) return;
                            return invoke<string[]>("enable_mod", {
                                profile,
                                modId: installedMod.id,
                                loadOrder: oldLoadOrder,
                            }).then((conflicts) => {
                                if (conflicts && conflicts.length > 0) {
                                    showFileConflictDialog(conflicts);
                                }
                            });
                        });
                    }).catch(showErrorDialog).finally(() => setInstalling(false));
                } else {
                    // FRESH INSTALL PATH
                    const maxOrder = (isMap || isTool) ? 0 : existingMods
                        .filter((m) => !m.isMap && m.loadOrder > 0)
                        .reduce((max, m) => Math.max(max, m.loadOrder), 0);

                    const installed: InstalledMod = {
                        id: mod!.slug,
                        apiModId: mod!.id,
                        name: mod!.name,
                        author: mod!.author,
                        installedVersion: version.version,
                        installedVersionId: version.id,
                        enabled: !isTool,
                        loadOrder: (isMap || isTool) ? 0 : maxOrder + 1,
                        files: task.extractedFiles,
                        isCustom: false,
                        isMap,
                        installedAt: new Date().toISOString(),
                    };

                    addMod(profile, installed);

                    // Log to download history
                    useDownloadHistory.getState().addEntry({
                        game: "Savage 2",
                        channel,
                        type: "install",
                        version: version.version,
                        previousVersion: null,
                        modName: mod!.name,
                    });

                    // Persist manifest first, then enable (tool mods skip enabling)
                    const manifest = toManifest(profile);
                    invoke("save_mod_manifest", { profile, manifest }).then(() => {
                        if (isTool) return;
                        if (isMap) {
                            return invoke("enable_map", { profile, modId: installed.id });
                        }
                        return invoke<string[]>("enable_mod", {
                            profile,
                            modId: installed.id,
                            loadOrder: installed.loadOrder,
                        }).then((conflicts) => {
                            if (conflicts && conflicts.length > 0) {
                                showFileConflictDialog(conflicts);
                            }
                        });
                    }).catch(showErrorDialog);

                    setInstalling(false);
                }
            },
        );

        task.onError = () => setInstalling(false);
        task.onCancel = () => setInstalling(false);

        addTask(task);
    }, [mod, profile, channel, installing, isMap, getMods, addMod, updateModVersion, installedMod, toManifest]);

    // ---- Toggle enable (smart group toggle) ----
    const handleToggleEnabled = useCallback(async () => {
        if (!installedMod) return;
        // Smart toggle: if any file is disabled → enable all, if all enabled → disable all
        const allEnabled = installedMod.files.every((f) => f.enabled);
        const newEnabled = !allEnabled;
        try {
            if (installedMod.isMap) {
                if (newEnabled) {
                    await invoke("enable_map", { profile, modId: installedMod.id });
                } else {
                    await invoke("disable_map", { profile, modId: installedMod.id });
                }
            } else {
                if (newEnabled) {
                    const filesToEnable = installedMod.files.filter((f) => !f.enabled).map((f) => f.filename);
                    const conflicts = await invoke<string[]>("enable_mod", {
                        profile, modId: installedMod.id, loadOrder: installedMod.loadOrder,
                        filenames: filesToEnable.length > 0 ? filesToEnable : null,
                    });
                    if (conflicts && conflicts.length > 0) {
                        await showFileConflictDialog(conflicts);
                    }
                } else {
                    await invoke("disable_mod", { profile, modId: installedMod.id });
                }
            }
            setModEnabled(profile, installedMod.id, newEnabled);
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            showErrorDialog(err);
        }
    }, [installedMod, profile, setModEnabled, toManifest]);

    // ---- Per-file toggle enable/disable ----
    const handleToggleFile = useCallback(async (file: InstalledModFile) => {
        if (!installedMod) return;
        const newEnabled = !file.enabled;
        try {
            if (newEnabled) {
                await invoke("enable_mod_file", {
                    profile, modId: installedMod.id, filename: file.filename, loadOrder: installedMod.loadOrder,
                });
            } else {
                await invoke("disable_mod_file", { profile, modId: installedMod.id, filename: file.filename });
            }
            setFileEnabled(profile, installedMod.id, file.filename, newEnabled);
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            showErrorDialog(err);
        }
    }, [installedMod, profile, setFileEnabled, toManifest]);

    // ---- XML file edit handler ----
    const handleEditXmlFile = useCallback(async (file: InstalledModFile) => {
        if (!installedMod) return;
        try {
            const content = await invoke<string>("read_mod_file_content", {
                profile, modId: installedMod.id, filename: file.filename,
            });
            const edited = await showXmlEditorDialog(file.filename, content);
            if (edited === null) return; // cancelled

            const newHash = await invoke<string>("write_mod_file_content", {
                profile, modId: installedMod.id, filename: file.filename,
                content: edited, loadOrder: installedMod.loadOrder, isEnabled: file.enabled,
            });

            // Update hash in store and persist
            const setFileHash = useModsStore.getState().setFileHash;
            setFileHash(profile, installedMod.id, file.filename, newHash);
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            showErrorDialog(err);
        }
    }, [installedMod, profile, toManifest]);

    // ---- Uninstall ----
    const handleUninstall = useCallback(async () => {
        if (!installedMod) return;

        // Warn if any XML files have been modified by the user
        const modifiedXmlFiles = installedMod.files.filter((f) => f.type === "xml" && f.modified);
        if (modifiedXmlFiles.length > 0) {
            const proceed = await showModifiedXmlWarning(installedMod.name, modifiedXmlFiles.map((f) => f.filename));
            if (!proceed) return;
        }

        try {
            if (installedMod.isMap) {
                await invoke("uninstall_map", { profile, modId: installedMod.id });
                removeMod(profile, installedMod.id);
            } else if (isToolMod(installedMod.files)) {
                // Tool mods only have staging files, no /game/ entries to clean up
                await invoke("delete_mod_files", { profile, modId: installedMod.id });
                removeMod(profile, installedMod.id);
            } else {
                await invoke("uninstall_mod", { profile, modId: installedMod.id });
                const oldMods = getMods(profile);
                removeMod(profile, installedMod.id);
                const newMods = getMods(profile);
                // Reorder remaining enabled mods whose load order shifted
                await reorderAfterRemoval(profile, oldMods, newMods);
            }
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            showErrorDialog(err);
        }
    }, [installedMod, profile, removeMod, getMods, toManifest]);

    // ---- Loading / Error ----
    if (isLoading) return <div className={styles.page}><div className={styles.loading}>{t("loading_mod_details")}</div></div>;
    if (error || !mod) return <div className={styles.page}><div className={styles.loading}>{t("failed_load_mod")}</div></div>;

    const latestVersion = mod.versions.find((v) => v.isLatest) ?? mod.versions[0];

    return (
        <div className={styles.page}>
            {/* Back navigation */}
            <div className={styles.back_bar}>
                <button className={styles.back_button} onClick={() => navigate(`/s2/${channel}`, { state: { activeTab: "mods" } })}>
                    <BackIcon />
                    {t("back", { ns: "common" })}
                </button>
            </div>

            {/* Lightbox */}
            {lightboxImage && (
                <div className={styles.lightbox} onClick={() => setLightboxImage(null)}>
                    <CachedImage cachedSrc={lightboxImage} alt={t("mod_screenshot")} />
                </div>
            )}

            <div className={styles.content}>
                {/* ====== Main column ====== */}
                <div className={styles.main_col}>
                    {/* Header */}
                    <div className={styles.header}>
                        <span className={styles.title}>{mod.name}</span>
                        <span className={styles.subtitle}>
                            {t("by_author", { author: mod.author })}
                            <span>&middot;</span>
                            <DownloadIcon /> {mod.totalDownloads} {t("downloads_suffix")}
                        </span>
                        {mod.tags.length > 0 && (
                            <div className={styles.tags_row}>
                                {mod.tags.map((tag) => (
                                    <span
                                        key={tag.id}
                                        className={styles.tag}
                                        style={{
                                            background: `${tag.color}20`,
                                            color: tag.color === "#ffffff" ? "rgba(255,255,255,0.8)" : tag.color,
                                        }}
                                    >
                                        {tag.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Image gallery */}
                    {sortedImages.length > 0 && (
                        <div
                            className={styles.gallery}
                            ref={galleryRef}
                            onMouseDown={handleGalleryMouseDown}
                            onMouseMove={handleGalleryMouseMove}
                            onMouseUp={handleGalleryMouseUp}
                            onMouseLeave={handleGalleryMouseUp}
                        >
                            {sortedImages.map((img) => (
                                <CachedImage
                                    key={img.id}
                                    className={styles.gallery_image}
                                    cachedSrc={`${repositoryBaseURL}${img.imageUrl}`}
                                    alt={`${mod.name} screenshot`}
                                    draggable={false}
                                    onClick={() => {
                                        if (!dragState.current.hasDragged) {
                                            setLightboxImage(`${repositoryBaseURL}${img.imageUrl}`);
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Description */}
                    <div className={styles.description}>
                        {mod.description}
                    </div>

                    {/* Version history */}
                    <div className={styles.versions_section}>
                        <span className={styles.section_heading}>{t("versions_label")}</span>
                        {mod.versions.map((ver) => (
                            <div key={ver.id} className={styles.version_card}>
                                <div className={styles.version_header}>
                                    <span className={styles.version_name}>
                                        v{ver.version}
                                        {ver.isLatest && <span className={styles.version_latest_badge}>{t("latest_badge")}</span>}
                                    </span>
                                    {installedMod?.installedVersionId === ver.id ? (
                                        <span className={styles.version_installed_badge}>
                                            <CheckmarkIcon />
                                            {t("installed_label")}
                                        </span>
                                    ) : (
                                        <button
                                            className={styles.version_install_button}
                                            onClick={() => handleInstall(ver)}
                                            disabled={installing}
                                        >
                                            {t("install", { ns: "common" })}
                                        </button>
                                    )}
                                </div>
                                <div className={styles.version_meta}>
                                    {ver.gameVersion && <span>{t("game_version_prefix", { version: ver.gameVersion })}</span>}
                                    <span>{formatFileSize(ver.fileSize)}</span>
                                    <span>{ver.downloadCount} {t("downloads_suffix")}</span>
                                    <span>{formatDate(ver.createdAt)}</span>
                                </div>
                                {ver.changelog && (
                                    <div className={styles.version_changelog}>{ver.changelog}</div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Installed files */}
                    {installedMod && installedMod.files.length > 0 && (
                        <div className={styles.versions_section}>
                            <span className={styles.section_heading}>
                                {t("installed_files")}
                                {installedMod.files.length > 1 && (
                                    <span className={styles.file_count}>
                                        {t("enabled_count", { count: installedMod.files.filter((f) => f.enabled).length, total: installedMod.files.length })}
                                    </span>
                                )}
                            </span>
                            <div className={styles.files_list}>
                                {installedMod.files.map((f) => (
                                    <div key={f.filename} className={`${styles.file_entry} ${!f.enabled ? styles.file_entry_disabled : ""}`}>
                                        <span className={`${styles.file_type_indicator} ${
                                            f.type === "s2z" ? styles.file_type_s2z
                                                : f.type === "xml" ? styles.file_type_xml
                                                    : styles.file_type_other
                                        }`}>
                                            {f.type}
                                        </span>
                                        {f.type === "xml" ? (
                                            <span
                                                className={`${styles.file_name} ${styles.file_name_clickable}`}
                                                onClick={() => handleEditXmlFile(f)}
                                                title={t("click_to_edit")}
                                            >
                                                {f.filename}
                                            </span>
                                        ) : (
                                            <span className={styles.file_name}>{f.filename}</span>
                                        )}
                                        {f.size > 0 && (
                                            <span className={styles.file_size}>{formatFileSize(f.size)}</span>
                                        )}
                                        {!isToolMod(installedMod.files) && (
                                            <button
                                                className={`${styles.file_toggle_btn} ${f.enabled ? styles.file_toggle_on : styles.file_toggle_off}`}
                                                onClick={() => handleToggleFile(f)}
                                                title={f.enabled ? t("disable_file") : t("enable_file")}
                                            >
                                                {f.enabled ? t("on", { ns: "common" }) : t("off", { ns: "common" })}
                                            </button>
                                        )}
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
                        {!isInstalled ? (
                            <div className={styles.action_row}>
                                <button
                                    className={`${styles.install_button} ${styles.install_button_primary}`}
                                    onClick={() => latestVersion && handleInstall(latestVersion)}
                                    disabled={installing || !latestVersion}
                                >
                                    {installing ? t("installing_mod") : t("install", { ns: "common" })}
                                </button>
                            </div>
                        ) : isToolMod(installedMod.files) ? (
                            <>
                                <div className={styles.action_row}>
                                    <button
                                        className={`${styles.install_button} ${styles.install_button_primary}`}
                                        onClick={() => invoke("reveal_mod_folder", { profile, modId: installedMod.id }).catch(showErrorDialog)}
                                    >
                                        <DriveIcon /> {t("open_folder")}
                                    </button>
                                </div>
                                <div className={styles.action_row}>
                                    {latestVersion && installedMod.installedVersion !== latestVersion.version && (
                                        <button
                                            className={`${styles.install_button} ${styles.install_button_update}`}
                                            onClick={() => handleInstall(latestVersion)}
                                            disabled={installing}
                                        >
                                            <UpgradeIcon /> {t("update_to", { version: `v${latestVersion.version}` })}
                                        </button>
                                    )}
                                    <button
                                        className={`${styles.install_button} ${styles.install_button_danger}`}
                                        onClick={handleUninstall}
                                    >
                                        {t("remove", { ns: "common" })}
                                    </button>
                                </div>
                            </>
                        ) : (() => {
                            const allEnabled = installedMod.files.every((f) => f.enabled);
                            const someEnabled = installedMod.files.some((f) => f.enabled);
                            return (
                                <>
                                    <div className={styles.action_row}>
                                        <button
                                            className={`${styles.install_button} ${someEnabled ? styles.install_button_enabled : styles.install_button_disabled_state}`}
                                            onClick={handleToggleEnabled}
                                        >
                                            {allEnabled ? t("enabled", { ns: "common" }) : someEnabled ? t("partial") : t("disabled", { ns: "common" })}
                                        </button>
                                    </div>
                                    <div className={styles.action_row}>
                                        {latestVersion && installedMod.installedVersion !== latestVersion.version && (
                                            <button
                                                className={`${styles.install_button} ${styles.install_button_update}`}
                                                onClick={() => handleInstall(latestVersion)}
                                                disabled={installing}
                                            >
                                                <UpgradeIcon /> {t("update_to", { version: `v${latestVersion.version}` })}
                                            </button>
                                        )}
                                        <button
                                            className={`${styles.install_button} ${styles.install_button_danger}`}
                                            onClick={handleUninstall}
                                        >
                                            {t("remove", { ns: "common" })}
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* Info card */}
                    <div className={styles.side_card}>
                        <span className={styles.side_card_title}>{t("details")}</span>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>{t("author_label")}</span>
                            <span className={styles.info_value}>{mod.author}</span>
                        </div>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>{t("latest_version_label")}</span>
                            <span className={styles.info_value}>{latestVersion?.version ?? "—"}</span>
                        </div>
                        {latestVersion?.gameVersion && (
                            <div className={styles.info_row}>
                                <span className={styles.info_label}>{t("game_version_label")}</span>
                                <span className={styles.info_value}>{latestVersion.gameVersion}</span>
                            </div>
                        )}
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>{t("total_downloads_label")}</span>
                            <span className={styles.info_value}>{mod.totalDownloads}</span>
                        </div>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>{t("created_label")}</span>
                            <span className={styles.info_value}>{formatDate(mod.createdAt)}</span>
                        </div>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>{t("updated_label")}</span>
                            <span className={styles.info_value}>{formatDate(mod.updatedAt)}</span>
                        </div>
                        {isInstalled && (
                            <>
                                <div className={styles.info_row}>
                                    <span className={styles.info_label}>{t("installed_label")}</span>
                                    <span className={styles.info_value}>v{installedMod.installedVersion}</span>
                                </div>
                                {!installedMod.isMap && !isToolMod(installedMod.files) && (
                                    <div className={styles.info_row}>
                                        <span className={styles.info_label}>{t("load_order_label")}</span>
                                        <span className={styles.info_value}>#{installedMod.loadOrder}</span>
                                    </div>
                                )}
                                {modFolderPath && (
                                    <div
                                        className={`${styles.info_row} ${styles.clickable_row}`}
                                        onClick={() => invoke("reveal_mod_folder", { profile, modId: installedMod.id }).catch(showErrorDialog)}
                                        title={modFolderPath}
                                    >
                                        <DriveIcon />
                                        <span className={styles.info_value} style={{ wordBreak: "break-all" }}>
                                            {modFolderPath}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ModPage;
