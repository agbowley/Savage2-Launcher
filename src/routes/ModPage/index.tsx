import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import styles from "./ModPage.module.css";
import { useModDetail } from "@app/hooks/useModDetail";
import { useModsStore } from "@app/stores/ModsStore";
import { BackIcon, DownloadIcon, DriveIcon, CheckmarkIcon } from "@app/assets/Icons";
import { repositoryBaseURL } from "@app/utils/consts";
import CachedImage from "@app/components/CachedImage";
import { addTask } from "@app/tasks";
import { ModDownloadTask } from "@app/tasks/Processors/Mod";
import { showDuplicateModDialog, showFileConflictDialog } from "@app/dialogs/dialogUtil";
import { useDownloadHistory } from "@app/stores/DownloadHistoryStore";
import type { ReleaseChannels } from "@app/hooks/useS2Release";
import type { ModVersion, InstalledMod } from "@app/types/mods";
import { isMapMod, isToolMod } from "@app/types/mods";

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
        if (old.isMap || !old.enabled) continue;
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
    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(new Date(iso));
}

const ModPage: React.FC = () => {
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
    const removeMod = useModsStore((s) => s.removeMod);
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
                            invoke("delete_mod_files", { profile, modId: mod.slug }).catch(console.error);
                            setInstalling(false);
                            return;
                        }
                    }
                }

                const isTool = isToolMod(task.extractedFiles);
                const maxOrder = (isMap || isTool) ? 0 : existingMods.reduce((max, m) => Math.max(max, m.loadOrder), 0);

                const installed: InstalledMod = {
                    id: mod.slug,
                    apiModId: mod.id,
                    name: mod.name,
                    author: mod.author,
                    installedVersion: version.version,
                    installedVersionId: version.id,
                    enabled: !isTool,
                    loadOrder: (isMap || isTool) ? 0 : maxOrder + 1,
                    files: task.extractedFiles,
                    isCustom: false,
                    isMap,
                    installedAt: new Date().toISOString(),
                };

                // Remove old entry if upgrading
                if (installedMod) {
                    removeMod(profile, installedMod.id);
                }
                addMod(profile, installed);

                // Log to download history
                useDownloadHistory.getState().addEntry({
                    game: "Savage 2",
                    channel,
                    type: installedMod ? "update" : "install",
                    version: version.version,
                    previousVersion: installedMod?.installedVersion ?? null,
                    modName: mod.name,
                });

                // Persist manifest first, then enable (tool mods skip enabling)
                const manifest = toManifest(profile);
                invoke("save_mod_manifest", { profile, manifest }).then(() => {
                    if (isTool) return; // No files to copy to /game/
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
                }).catch(console.error);

                setInstalling(false);
            },
        );

        task.onError = () => setInstalling(false);
        task.onCancel = () => setInstalling(false);

        addTask(task);
    }, [mod, profile, installing, isMap, getMods, addMod, removeMod, installedMod, toManifest]);

    // ---- Toggle enable ----
    const handleToggleEnabled = useCallback(async () => {
        if (!installedMod) return;
        const newEnabled = !installedMod.enabled;
        try {
            if (installedMod.isMap) {
                if (newEnabled) {
                    await invoke("enable_map", { profile, modId: installedMod.id });
                } else {
                    await invoke("disable_map", { profile, modId: installedMod.id });
                }
            } else {
                if (newEnabled) {
                    const conflicts = await invoke<string[]>("enable_mod", { profile, modId: installedMod.id, loadOrder: installedMod.loadOrder });
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
            console.error("Failed to toggle mod:", err);
        }
    }, [installedMod, profile, setModEnabled, toManifest]);

    // ---- Uninstall ----
    const handleUninstall = useCallback(async () => {
        if (!installedMod) return;
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
            console.error("Failed to uninstall:", err);
        }
    }, [installedMod, profile, removeMod, getMods, toManifest]);

    // ---- Loading / Error ----
    if (isLoading) return <div className={styles.page}><div className={styles.loading}>Loading mod details...</div></div>;
    if (error || !mod) return <div className={styles.page}><div className={styles.loading}>Failed to load mod.</div></div>;

    const latestVersion = mod.versions.find((v) => v.isLatest) ?? mod.versions[0];

    return (
        <div className={styles.page}>
            {/* Back navigation */}
            <div className={styles.back_bar}>
                <button className={styles.back_button} onClick={() => navigate(`/s2/${channel}`, { state: { activeTab: "mods" } })}>
                    <BackIcon />
                    Back
                </button>
            </div>

            {/* Lightbox */}
            {lightboxImage && (
                <div className={styles.lightbox} onClick={() => setLightboxImage(null)}>
                    <CachedImage cachedSrc={lightboxImage} alt="Mod screenshot" />
                </div>
            )}

            <div className={styles.content}>
                {/* ====== Main column ====== */}
                <div className={styles.main_col}>
                    {/* Header */}
                    <div className={styles.header}>
                        <span className={styles.title}>{mod.name}</span>
                        <span className={styles.subtitle}>
                            by {mod.author}
                            <span>&middot;</span>
                            <DownloadIcon /> {mod.totalDownloads} downloads
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
                        <span className={styles.section_heading}>Versions</span>
                        {mod.versions.map((ver) => (
                            <div key={ver.id} className={styles.version_card}>
                                <div className={styles.version_header}>
                                    <span className={styles.version_name}>
                                        v{ver.version}
                                        {ver.isLatest && <span className={styles.version_latest_badge}>Latest</span>}
                                    </span>
                                    {installedMod?.installedVersionId === ver.id ? (
                                        <span className={styles.version_installed_badge}>
                                            <CheckmarkIcon />
                                            Installed
                                        </span>
                                    ) : (
                                        <button
                                            className={styles.version_install_button}
                                            onClick={() => handleInstall(ver)}
                                            disabled={installing}
                                        >
                                            Install
                                        </button>
                                    )}
                                </div>
                                <div className={styles.version_meta}>
                                    {ver.gameVersion && <span>Game: {ver.gameVersion}</span>}
                                    <span>{formatFileSize(ver.fileSize)}</span>
                                    <span>{ver.downloadCount} downloads</span>
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
                            <span className={styles.section_heading}>Installed Files</span>
                            <div className={styles.files_list}>
                                {installedMod.files.map((f) => (
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
                        {!isInstalled ? (
                            <div className={styles.action_row}>
                                <button
                                    className={`${styles.install_button} ${styles.install_button_primary}`}
                                    onClick={() => latestVersion && handleInstall(latestVersion)}
                                    disabled={installing || !latestVersion}
                                >
                                    {installing ? "Installing..." : "Install"}
                                </button>
                            </div>
                        ) : isToolMod(installedMod.files) ? (
                            <>
                                <div className={styles.action_row}>
                                    <button
                                        className={`${styles.install_button} ${styles.install_button_primary}`}
                                        onClick={() => invoke("reveal_mod_folder", { profile, modId: installedMod.id }).catch(console.error)}
                                    >
                                        <DriveIcon /> Open Folder
                                    </button>
                                </div>
                                <div className={styles.action_row}>
                                    {latestVersion && installedMod.installedVersion !== latestVersion.version && (
                                        <button
                                            className={`${styles.install_button} ${styles.install_button_primary}`}
                                            onClick={() => handleInstall(latestVersion)}
                                            disabled={installing}
                                        >
                                            Update to v{latestVersion.version}
                                        </button>
                                    )}
                                    <button
                                        className={`${styles.install_button} ${styles.install_button_danger}`}
                                        onClick={handleUninstall}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={styles.action_row}>
                                    <button
                                        className={`${styles.install_button} ${installedMod.enabled ? styles.install_button_enabled : styles.install_button_disabled_state}`}
                                        onClick={handleToggleEnabled}
                                    >
                                        {installedMod.enabled ? "Enabled" : "Disabled"}
                                    </button>
                                </div>
                                <div className={styles.action_row}>
                                    {latestVersion && installedMod.installedVersion !== latestVersion.version && (
                                        <button
                                            className={`${styles.install_button} ${styles.install_button_primary}`}
                                            onClick={() => handleInstall(latestVersion)}
                                            disabled={installing}
                                        >
                                            Update to v{latestVersion.version}
                                        </button>
                                    )}
                                    <button
                                        className={`${styles.install_button} ${styles.install_button_danger}`}
                                        onClick={handleUninstall}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Info card */}
                    <div className={styles.side_card}>
                        <span className={styles.side_card_title}>Details</span>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>Author</span>
                            <span className={styles.info_value}>{mod.author}</span>
                        </div>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>Latest Version</span>
                            <span className={styles.info_value}>{latestVersion?.version ?? "—"}</span>
                        </div>
                        {latestVersion?.gameVersion && (
                            <div className={styles.info_row}>
                                <span className={styles.info_label}>Game Version</span>
                                <span className={styles.info_value}>{latestVersion.gameVersion}</span>
                            </div>
                        )}
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>Total Downloads</span>
                            <span className={styles.info_value}>{mod.totalDownloads}</span>
                        </div>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>Created</span>
                            <span className={styles.info_value}>{formatDate(mod.createdAt)}</span>
                        </div>
                        <div className={styles.info_row}>
                            <span className={styles.info_label}>Updated</span>
                            <span className={styles.info_value}>{formatDate(mod.updatedAt)}</span>
                        </div>
                        {isInstalled && (
                            <>
                                <div className={styles.info_row}>
                                    <span className={styles.info_label}>Installed</span>
                                    <span className={styles.info_value}>v{installedMod.installedVersion}</span>
                                </div>
                                {!installedMod.isMap && !isToolMod(installedMod.files) && (
                                    <div className={styles.info_row}>
                                        <span className={styles.info_label}>Load Order</span>
                                        <span className={styles.info_value}>#{installedMod.loadOrder}</span>
                                    </div>
                                )}
                                {modFolderPath && (
                                    <div
                                        className={`${styles.info_row} ${styles.clickable_row}`}
                                        onClick={() => invoke("reveal_mod_folder", { profile, modId: installedMod.id }).catch(console.error)}
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
