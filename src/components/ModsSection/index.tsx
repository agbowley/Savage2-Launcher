import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import styles from "./ModsSection.module.css";
import ModCard from "./ModCard";
import { useMods } from "@app/hooks/useMods";
import { useModsStore } from "@app/stores/ModsStore";
import { PuzzleIcon, DownloadIcon, DriveIcon, InformationIcon } from "@app/assets/Icons";
import TooltipWrapper from "@app/components/TooltipWrapper";
import { ReleaseChannels } from "@app/hooks/useS2Release";
import type { ModSortBy, InstalledMod, InstalledModFile, ScannedModFile, ModDetail, ModListItem } from "@app/types/mods";
import { isMapMod, isToolMod } from "@app/types/mods";
import { useNavigate } from "react-router-dom";
import { showDeleteModDialog, showDuplicateModDialog, showErrorDialog, showFileConflictDialog, showModifiedXmlWarning, showXmlEditorDialog } from "@app/dialogs/dialogUtil";
import { repositoryBaseURL } from "@app/utils/consts";
import { tauriFetchJson } from "@app/utils/tauriFetch";
import { getNewsBanner } from "@app/assets/NewsBanners";
import CachedImage from "@app/components/CachedImage";
import { addTask } from "@app/tasks";
import { ModDownloadTask } from "@app/tasks/Processors/Mod";
import { useDownloadHistory } from "@app/stores/DownloadHistoryStore";
import { useBrowsePrefsStore } from "@app/stores/BrowsePrefsStore";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

/** Map frontend channel to backend profile tag. */
function channelToProfile(channel: ReleaseChannels): string {
    switch (channel) {
        case "stable": return "latest";
        case "nightly": return "beta";
        case "legacy": return "legacy";
    }
}

/** Format bytes to human-readable size. */
function formatFileSize(bytes: number): string {
    if (bytes === 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
    channel: ReleaseChannels;
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

const ModsSection: React.FC<Props> = ({ channel }: Props) => {
    const profile = channelToProfile(channel);
    const navigate = useNavigate();

    // ---- State ----
    const subTab = useBrowsePrefsStore((s) => s.subTab);
    const setSubTab = useBrowsePrefsStore((s) => s.setSubTab);
    const [search, setSearch] = useState("");
    const sortBy = useBrowsePrefsStore((s) => s.sortBy);
    const sortDesc = useBrowsePrefsStore((s) => s.sortDesc);
    const viewMode = useBrowsePrefsStore((s) => s.viewMode);
    const setSortBy = useBrowsePrefsStore((s) => s.setSortBy);
    const setSortDesc = useBrowsePrefsStore((s) => s.setSortDesc);
    const setViewMode = useBrowsePrefsStore((s) => s.setViewMode);
    const persistedTagIds = useBrowsePrefsStore((s) => s.selectedTagIds);
    const setPersistedTagIds = useBrowsePrefsStore((s) => s.setSelectedTagIds);
    const selectedTagIds = useMemo(() => new Set(persistedTagIds), [persistedTagIds]);
    const setSelectedTagIds = useCallback((ids: Set<number>) => {
        setPersistedTagIds([...ids]);
    }, [setPersistedTagIds]);
    const [page, setPage] = useState(1);
    const [pendingInstalls, setPendingInstalls] = useState<Set<number>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // ---- Data ----
    const { data, isLoading, error } = useMods({
        page: 1,
        pageSize: page * 24,
        sortBy,
        sortDesc,
        tagIds: selectedTagIds.size > 0 ? [...selectedTagIds] : undefined,
        search: search || undefined,
    });

    const installedMods = useModsStore((s) => s.getMods(profile));
    const addMod = useModsStore((s) => s.addMod);
    const setModEnabled = useModsStore((s) => s.setModEnabled);
    const setFileEnabled = useModsStore((s) => s.setFileEnabled);
    const removeMod = useModsStore((s) => s.removeMod);
    const reorderMods = useModsStore((s) => s.reorderMods);
    const toManifest = useModsStore((s) => s.toManifest);
    const getMods = useModsStore((s) => s.getMods);

    // Split installed entries into regular mods, tool mods, and maps
    const regularMods = useMemo(() => installedMods.filter((m) => !m.isMap && !isToolMod(m.files)), [installedMods]);
    const toolMods = useMemo(() => installedMods.filter((m) => !m.isMap && isToolMod(m.files)), [installedMods]);
    const installedMaps = useMemo(() => installedMods.filter((m) => m.isMap), [installedMods]);

    // ---- Import state ----
    const [importMode, setImportMode] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [noLocalMods, setNoLocalMods] = useState(false);
    const [gameFiles, setGameFiles] = useState<ScannedModFile[]>([]);
    const [selectedImportFiles, setSelectedImportFiles] = useState<Set<string>>(new Set());
    const [importGroupName, setImportGroupName] = useState("");
    const [importing, setImporting] = useState(false);

    const installedIdSet = useMemo(
        () => new Set(installedMods.filter((m) => m.apiModId !== null).map((m) => m.apiModId)),
        [installedMods],
    );

    const installedByApiId = useMemo(() => {
        const map = new Map<number, InstalledMod>();
        for (const mod of installedMods) {
            if (mod.apiModId !== null) map.set(mod.apiModId, mod);
        }
        return map;
    }, [installedMods]);

    // ---- Collect unique tags (only from unfiltered results to prevent disappearing chips) ----
    const cachedTags = useBrowsePrefsStore((s) => s.cachedTags);
    const setCachedTags = useBrowsePrefsStore((s) => s.setCachedTags);
    const cachedTagsRef = useRef(cachedTags);
    cachedTagsRef.current = cachedTags;

    useEffect(() => {
        // Merge new tags into cache (so tags from earlier pages aren't lost)
        if (data) {
            const existing = cachedTagsRef.current;
            const map = new Map<number, { id: number; name: string; slug: string; color: string }>();
            // Start with existing cached tags
            for (const tag of existing) {
                map.set(tag.id, tag);
            }
            // Add any new tags from results
            for (const item of data.items) {
                for (const tag of item.tags) {
                    if (!map.has(tag.id)) map.set(tag.id, tag);
                }
            }
            const merged = [...map.values()];
            if (merged.length !== existing.length) {
                setCachedTags(merged);
            }
        }
    }, [data, setCachedTags]);

    const uniqueTags = cachedTags;

    // ---- Enable/disable handler (smart group toggle) ----
    const handleToggleEnabled = useCallback(async (mod: InstalledMod) => {
        // Smart toggle: if any file is disabled → enable all, if all enabled → disable all
        const allEnabled = mod.files.every((f) => f.enabled);
        const newEnabled = !allEnabled;
        try {
            if (mod.isMap) {
                if (newEnabled) {
                    await invoke("enable_map", { profile, modId: mod.id });
                } else {
                    await invoke("disable_map", { profile, modId: mod.id });
                }
            } else {
                if (newEnabled) {
                    // Enable only the files that are currently disabled
                    const filesToEnable = mod.files.filter((f) => !f.enabled).map((f) => f.filename);
                    const conflicts = await invoke<string[]>("enable_mod", {
                        profile, modId: mod.id, loadOrder: mod.loadOrder,
                        filenames: filesToEnable.length > 0 ? filesToEnable : null,
                    });
                    if (conflicts && conflicts.length > 0) {
                        await showFileConflictDialog(conflicts);
                    }
                } else {
                    await invoke("disable_mod", { profile, modId: mod.id });
                }
            }
            setModEnabled(profile, mod.id, newEnabled);
            // Persist manifest
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            showErrorDialog(err);
        }
    }, [profile, setModEnabled, toManifest]);

    // ---- Per-file enable/disable handler ----
    const handleToggleFile = useCallback(async (mod: InstalledMod, file: InstalledModFile) => {
        const newEnabled = !file.enabled;
        try {
            if (newEnabled) {
                await invoke("enable_mod_file", {
                    profile, modId: mod.id, filename: file.filename, loadOrder: mod.loadOrder,
                });
            } else {
                await invoke("disable_mod_file", { profile, modId: mod.id, filename: file.filename });
            }
            setFileEnabled(profile, mod.id, file.filename, newEnabled);
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            showErrorDialog(err);
        }
    }, [profile, setFileEnabled, toManifest]);

    // ---- XML file edit handler ----
    const handleEditXmlFile = useCallback(async (mod: InstalledMod, file: InstalledModFile) => {
        try {
            const content = await invoke<string>("read_mod_file_content", {
                profile, modId: mod.id, filename: file.filename,
            });
            const edited = await showXmlEditorDialog(file.filename, content);
            if (edited === null) return; // cancelled

            const newHash = await invoke<string>("write_mod_file_content", {
                profile, modId: mod.id, filename: file.filename,
                content: edited, loadOrder: mod.loadOrder, isEnabled: file.enabled,
            });

            // Update hash in store and persist
            const setFileHash = useModsStore.getState().setFileHash;
            setFileHash(profile, mod.id, file.filename, newHash);
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            showErrorDialog(err);
        }
    }, [profile, toManifest]);

    // ---- Map enable/disable handler ----
    const handleToggleMapEnabled = useCallback(async (mod: InstalledMod) => {
        const newEnabled = !mod.enabled;
        try {
            if (newEnabled) {
                await invoke("enable_map", { profile, modId: mod.id });
            } else {
                await invoke("disable_map", { profile, modId: mod.id });
            }
            setModEnabled(profile, mod.id, newEnabled);
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            showErrorDialog(err);
        }
    }, [profile, setModEnabled, toManifest]);

    // ---- Map uninstall handler ----
    const handleDeleteMap = useCallback(async (mod: InstalledMod) => {
        try {
            await invoke("uninstall_map", { profile, modId: mod.id });
            removeMod(profile, mod.id);
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            showErrorDialog(err);
        }
    }, [profile, removeMod, toManifest]);

    // ---- Uninstall / Delete handler ----
    const handleDelete = useCallback(async (mod: InstalledMod) => {
        // Warn if any XML files have been modified by the user
        const modifiedXmlFiles = mod.files.filter((f) => f.type === "xml" && f.modified);
        if (modifiedXmlFiles.length > 0) {
            const proceed = await showModifiedXmlWarning(mod.name, modifiedXmlFiles.map((f) => f.filename));
            if (!proceed) return;
        }

        if (mod.isCustom) {
            // Custom mods get the delete dialog with file deletion option
            const result = await showDeleteModDialog(mod.name, mod.files.length);
            if (!result) return; // Cancelled

            try {
                if (result === "delete-files") {
                    // Disable first (remove from /game/), then delete staging files
                    await invoke("disable_mod", { profile, modId: mod.id });
                    await invoke("delete_mod_files", { profile, modId: mod.id });
                } else {
                    // "remove-only": rename files in /game/ back to originals, leave on disk
                    if (mod.enabled) {
                        await invoke("restore_mod_filenames", {
                            profile, modId: mod.id, loadOrder: mod.loadOrder,
                        });
                    }
                    // Clean up the staging directory (files are back in /game/ with original names)
                    await invoke("delete_mod_files", { profile, modId: mod.id });
                }

                const oldMods = getMods(profile);
                removeMod(profile, mod.id);
                const newMods = getMods(profile);
                await reorderAfterRemoval(profile, oldMods, newMods);
                const manifest = toManifest(profile);
                await invoke("save_mod_manifest", { profile, manifest });
            } catch (err) {
                showErrorDialog(err);
            }
        } else {
            // API mods use the regular uninstall flow
            try {
                if (mod.isMap) {
                    await invoke("uninstall_map", { profile, modId: mod.id });
                } else if (isToolMod(mod.files)) {
                    // Tool mods only have staging files, no /game/ entries
                    await invoke("delete_mod_files", { profile, modId: mod.id });
                } else {
                    await invoke("uninstall_mod", { profile, modId: mod.id });
                }
                const oldMods = getMods(profile);
                removeMod(profile, mod.id);
                if (!mod.isMap && !isToolMod(mod.files)) {
                    const newMods = getMods(profile);
                    await reorderAfterRemoval(profile, oldMods, newMods);
                }
                const manifest = toManifest(profile);
                await invoke("save_mod_manifest", { profile, manifest });
            } catch (err) {
                showErrorDialog(err);
            }
        }
    }, [profile, removeMod, getMods, toManifest]);

    // ---- Quick install from browse ----
    const handleQuickInstall = useCallback(async (modItem: ModListItem) => {
        if (pendingInstalls.has(modItem.id)) return;
        setPendingInstalls((prev) => new Set(prev).add(modItem.id));

        try {
            const detail = await tauriFetchJson<ModDetail>(
                `${repositoryBaseURL}/api/mods/${modItem.id}`,
            );
            const latestVersion = detail.versions.find((v) => v.isLatest) ?? detail.versions[0];
            if (!latestVersion) return;

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
                    const isMap = isMapMod(detail.tags);
                    const existingMods = getMods(profile);

                    // Check for duplicate files in existing mods
                    const newHashes = new Set(task.extractedFiles.map((f) => f.hash).filter(Boolean));
                    if (newHashes.size > 0) {
                        for (const existing of existingMods) {
                            const match = existing.files.some((f) => f.hash && newHashes.has(f.hash));
                            if (match) {
                                showDuplicateModDialog(detail.name, existing.name);
                                invoke("delete_mod_files", { profile, modId: detail.slug }).catch(showErrorDialog);
                                setPendingInstalls((prev) => { const next = new Set(prev); next.delete(modItem.id); return next; });
                                return;
                            }
                        }
                    }

                    const isTool = isToolMod(task.extractedFiles);
                    const maxOrder = (isMap || isTool) ? 0 : existingMods
                        .filter(m => !m.isMap && m.loadOrder > 0)
                        .reduce((max, m) => Math.max(max, m.loadOrder), 0);

                    const installed: InstalledMod = {
                        id: detail.slug,
                        apiModId: detail.id,
                        name: detail.name,
                        author: detail.author,
                        installedVersion: latestVersion.version,
                        installedVersionId: latestVersion.id,
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
                        version: latestVersion.version,
                        previousVersion: null,
                        modName: detail.name,
                    });

                    const manifest = toManifest(profile);
                    invoke("save_mod_manifest", { profile, manifest }).then(() => {
                        if (isTool) {
                            // Tool mods have no files to copy into /game/
                            return;
                        }
                        if (isMap) {
                            return invoke("enable_map", { profile, modId: installed.id });
                        }
                        return invoke<string[]>("enable_mod", { profile, modId: installed.id, loadOrder: installed.loadOrder })
                            .then((conflicts) => {
                                if (conflicts && conflicts.length > 0) {
                                    showFileConflictDialog(conflicts);
                                }
                            });
                    }).catch(showErrorDialog);

                    setPendingInstalls((prev) => { const next = new Set(prev); next.delete(modItem.id); return next; });
                },
            );

            task.onError = () => setPendingInstalls((prev) => { const next = new Set(prev); next.delete(modItem.id); return next; });
            task.onCancel = () => setPendingInstalls((prev) => { const next = new Set(prev); next.delete(modItem.id); return next; });

            addTask(task);
        } catch (err) {
            console.error("Failed to start mod install:", err);
            setPendingInstalls((prev) => { const next = new Set(prev); next.delete(modItem.id); return next; });
        }
    }, [profile, pendingInstalls, getMods, addMod, toManifest]);

    // ---- Import: scan game folder ----
    const handleStartImport = useCallback(async () => {
        setScanning(true);
        setNoLocalMods(false);
        try {
            const files = await invoke("scan_game_mods", { profile }) as ScannedModFile[];
            // Filter out files already managed by the launcher (by filename or hash)
            const managedFilenames = new Set(
                installedMods.flatMap((m) => m.files.map((f) => f.filename.toLowerCase())),
            );
            const managedHashes = new Set(
                installedMods.flatMap((m) => m.files.map((f) => f.hash.toLowerCase())),
            );
            const unmanaged = files.filter(
                (f) => !managedFilenames.has(f.filename.toLowerCase()) && !managedHashes.has(f.hash.toLowerCase()),
            );
            if (unmanaged.length === 0) {
                setNoLocalMods(true);
            } else {
                setGameFiles(unmanaged);
                setSelectedImportFiles(new Set());
                setImportGroupName("");
                setImportMode(true);
            }
        } catch (err) {
            showErrorDialog(err);
        } finally {
            setScanning(false);
        }
    }, [profile, installedMods]);

    // ---- Import: confirm import ----
    const handleConfirmImport = useCallback(async () => {
        if (selectedImportFiles.size === 0) return;
        setImporting(true);
        try {
            const filenames = [...selectedImportFiles];
            const modId = `custom-${Date.now()}`;

            let groupName = importGroupName.trim();
            if (!groupName) {
                // Find the next available "Local Mod Group N" number
                const existingNums = installedMods
                    .map((m) => m.name.match(/^Local Mod Group (\d+)$/)?.[1])
                    .filter(Boolean)
                    .map(Number);
                const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
                groupName = `Local Mod Group ${nextNum}`;
            }

            // Import files to staging directory
            const importedFiles = await invoke("import_mod_files", {
                profile,
                modId,
                filenames,
            }) as InstalledModFile[];

            // Determine load order
            const existingMods = installedMods;
            const maxOrder = existingMods
                .filter(m => !m.isMap && m.loadOrder > 0)
                .reduce((max, m) => Math.max(max, m.loadOrder), 0);

            const installed: InstalledMod = {
                id: modId,
                apiModId: null,
                name: groupName,
                author: "Custom",
                installedVersion: "1.0",
                installedVersionId: null,
                enabled: true,
                loadOrder: maxOrder + 1,
                files: importedFiles,
                isCustom: true,
                isMap: false,
                installedAt: new Date().toISOString(),
            };

            addMod(profile, installed);

            // Save manifest first, then enable in /game/
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
            const conflicts = await invoke<string[]>("enable_mod", { profile, modId: installed.id, loadOrder: installed.loadOrder });
            if (conflicts && conflicts.length > 0) {
                await showFileConflictDialog(conflicts);
            }

            setImportMode(false);
        } catch (err) {
            showErrorDialog(err);
        } finally {
            setImporting(false);
        }
    }, [selectedImportFiles, importGroupName, profile, installedMods, addMod, toManifest]);

    // ---- Reorder handlers ----
    const handleMoveUp = useCallback(async (modId: string, currentIndex: number) => {
        if (currentIndex <= 0) return;
        const sorted = [...regularMods].sort((a, b) => a.loadOrder - b.loadOrder);
        const ids = sorted.map((m) => m.id);
        // Swap
        [ids[currentIndex], ids[currentIndex - 1]] = [ids[currentIndex - 1], ids[currentIndex]];
        reorderMods(profile, ids);

        // Rename files in game folder
        const mod = sorted[currentIndex];
        const swapped = sorted[currentIndex - 1];
        try {
            await invoke("reorder_mod", { profile, modId: mod.id, oldLoadOrder: mod.loadOrder, newLoadOrder: swapped.loadOrder });
            await invoke("reorder_mod", { profile, modId: swapped.id, oldLoadOrder: swapped.loadOrder, newLoadOrder: mod.loadOrder });
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            // Revert store to original order
            const revertIds = sorted.map((m) => m.id);
            reorderMods(profile, revertIds);
            showErrorDialog(err);
        }
    }, [regularMods, profile, reorderMods, toManifest]);

    const handleMoveDown = useCallback(async (modId: string, currentIndex: number) => {
        const sorted = [...regularMods].sort((a, b) => a.loadOrder - b.loadOrder);
        if (currentIndex >= sorted.length - 1) return;
        const ids = sorted.map((m) => m.id);
        [ids[currentIndex], ids[currentIndex + 1]] = [ids[currentIndex + 1], ids[currentIndex]];
        reorderMods(profile, ids);

        const mod = sorted[currentIndex];
        const swapped = sorted[currentIndex + 1];
        try {
            await invoke("reorder_mod", { profile, modId: mod.id, oldLoadOrder: mod.loadOrder, newLoadOrder: swapped.loadOrder });
            await invoke("reorder_mod", { profile, modId: swapped.id, oldLoadOrder: swapped.loadOrder, newLoadOrder: mod.loadOrder });
            const manifest = toManifest(profile);
            await invoke("save_mod_manifest", { profile, manifest });
        } catch (err) {
            // Revert store to original order
            const revertIds = sorted.map((m) => m.id);
            reorderMods(profile, revertIds);
            showErrorDialog(err);
        }
    }, [regularMods, profile, reorderMods, toManifest]);

    // ------- Render -------

    return (
        <div className={styles.container}>
            {/* Sub-tab bar */}
            <div className={styles.sub_tabs}>
                <button
                    className={`${styles.sub_tab} ${subTab === "browse" ? styles.sub_tab_active : ""}`}
                    onClick={() => setSubTab("browse")}
                >
                    Browse
                </button>
                <button
                    className={`${styles.sub_tab} ${subTab === "installed" ? styles.sub_tab_active : ""}`}
                    onClick={() => setSubTab("installed")}
                >
                    Installed ({regularMods.length + toolMods.length + installedMaps.length})
                </button>
            </div>

            {/* ========== BROWSE TAB ========== */}
            {subTab === "browse" && (
                <>
                    {/* Filters */}
                    <div className={styles.filters}>
                        <input
                            className={styles.search_input}
                            type="text"
                            placeholder="Search mods..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        />
                        <DropdownMenu.Root modal={false}>
                            <DropdownMenu.Trigger asChild>
                                <button className={styles.sort_trigger}>
                                    {sortBy === "downloads" ? "Most Downloaded" : sortBy === "createdAt" ? "Newest" : sortBy === "updatedAt" ? "Recently Updated" : "Name"}
                                    {sortDesc ? " ↓" : " ↑"}
                                    <svg className={styles.sort_chevron} viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content className={styles.sort_dropdown_content} sideOffset={5} align="start">
                                    {([
                                        ["downloads", "Most Downloaded"],
                                        ["createdAt", "Newest"],
                                        ["updatedAt", "Recently Updated"],
                                        ["name", "Name"],
                                    ] as [ModSortBy, string][]).map(([value, label]) => (
                                        <DropdownMenu.Item
                                            key={value}
                                            className={`${styles.sort_dropdown_item} ${sortBy === value ? styles.sort_dropdown_item_active : ""}`}
                                            onSelect={() => {
                                                if (sortBy === value) {
                                                    setSortDesc(!sortDesc);
                                                } else {
                                                    setSortBy(value);
                                                }
                                                setPage(1);
                                            }}
                                        >
                                            {label}
                                            {sortBy === value && (
                                                <span className={styles.sort_direction_indicator}>
                                                    {sortDesc ? "↓" : "↑"}
                                                </span>
                                            )}
                                        </DropdownMenu.Item>
                                    ))}
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                        <div className={styles.view_toggle}>
                            <button
                                className={`${styles.view_toggle_btn} ${viewMode === "grid" ? styles.view_toggle_active : ""}`}
                                onClick={() => setViewMode("grid")}
                                title="Grid view"
                            >
                                <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
                            </button>
                            <button
                                className={`${styles.view_toggle_btn} ${viewMode === "list" ? styles.view_toggle_active : ""}`}
                                onClick={() => setViewMode("list")}
                                title="List view"
                            >
                                <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2.5" rx="1"/><rect x="1" y="6.75" width="14" height="2.5" rx="1"/><rect x="1" y="11.5" width="14" height="2.5" rx="1"/></svg>
                            </button>
                        </div>
                    </div>

                    {/* Tag chips */}
                    {uniqueTags.length > 0 && (
                        <div className={styles.filters}>
                            <button
                                className={`${styles.tag_chip} ${selectedTagIds.size === 0 ? styles.tag_chip_active : ""}`}
                                onClick={() => { setSelectedTagIds(new Set()); setPage(1); }}
                            >
                                All
                            </button>
                            {uniqueTags.map((tag) => {
                                const isSelected = selectedTagIds.has(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        className={`${styles.tag_chip} ${isSelected ? styles.tag_chip_active : ""}`}
                                        onClick={() => {
                                            const next = new Set(selectedTagIds);
                                            if (isSelected) {
                                                next.delete(tag.id);
                                            } else {
                                                next.add(tag.id);
                                            }
                                            setSelectedTagIds(next);
                                            setPage(1);
                                        }}
                                        style={isSelected ? {
                                            borderColor: tag.color === "#ffffff" ? "rgba(255,255,255,0.4)" : tag.color,
                                            color: tag.color === "#ffffff" ? "rgba(255,255,255,0.8)" : tag.color,
                                        } : undefined}
                                    >
                                        {tag.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Loading / Error */}
                    {isLoading && <div className={styles.empty}>Loading mods...</div>}
                    {error && <div className={styles.empty}>Failed to load mods.</div>}

                    {/* Mod grid / list */}
                    {data && (
                        <>
                            {viewMode === "list" ? (
                                <div className={styles.browse_list}>
                                    {data.items.map((modItem) => {
                                        const inst = installedByApiId.get(modItem.id);
                                        const imageUrl = modItem.primaryImageUrl
                                            ? `${repositoryBaseURL}${modItem.primaryImageUrl}`
                                            : null;
                                        const fb = getNewsBanner(modItem.id);
                                        const isMultiFile = inst && inst.files.length > 1;
                                        const isBrowseExpanded = inst ? expandedGroups.has(inst.id) : false;
                                        const allFilesEnabled = inst ? inst.files.every((f) => f.enabled) : false;
                                        const someFilesEnabled = inst ? inst.files.some((f) => f.enabled) : false;
                                        const isPartial = someFilesEnabled && !allFilesEnabled;
                                        return (
                                            <React.Fragment key={modItem.id}>
                                                <div
                                                    className={styles.browse_row}
                                                    onClick={() => navigate(`/mods/${modItem.id}?channel=${channel}`)}
                                                >
                                                    <div className={styles.browse_thumb}>
                                                        <CachedImage cachedSrc={imageUrl} fallbackSrc={fb.url} alt={modItem.name} />
                                                    </div>
                                                    {isMultiFile && (
                                                        <button
                                                            className={`${styles.expand_chevron} ${isBrowseExpanded ? styles.expand_chevron_open : ""}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setExpandedGroups((prev) => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(inst.id)) next.delete(inst.id);
                                                                    else next.add(inst.id);
                                                                    return next;
                                                                });
                                                            }}
                                                            title={isBrowseExpanded ? "Collapse files" : "Expand files"}
                                                        >
                                                            <svg viewBox="0 0 8 12" fill="currentColor"><path d="M1.5 0L7.5 6L1.5 12L0 10.5L4.5 6L0 1.5L1.5 0Z"/></svg>
                                                        </button>
                                                    )}
                                                    <div className={styles.browse_info}>
                                                        <span className={styles.browse_name}>
                                                            {modItem.name}
                                                            {isPartial && <span className={styles.partial_badge}>Partial</span>}
                                                            {modItem.tags.length > 0 && (
                                                                <span className={styles.browse_name_tags}>
                                                                    {modItem.tags.slice(0, 2).map((tag) => (
                                                                        <span
                                                                            key={tag.id}
                                                                            className={styles.browse_tag}
                                                                            style={{
                                                                                background: `${tag.color}20`,
                                                                                color: tag.color === "#ffffff" ? "rgba(255,255,255,0.8)" : tag.color,
                                                                            }}
                                                                        >
                                                                            {tag.name}
                                                                        </span>
                                                                    ))}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className={styles.browse_meta}>
                                                            by {modItem.author} &middot; <DownloadIcon /> {modItem.totalDownloads} &middot; v{modItem.latestVersion}
                                                        </span>
                                                    </div>
                                                    <div className={styles.browse_actions} onClick={(e) => e.stopPropagation()}>
                                                        {inst && (
                                                            isToolMod(inst.files) ? (
                                                                <button
                                                                    className={`${styles.action_button} ${styles.action_button_folder}`}
                                                                    onClick={() => invoke("reveal_mod_folder", { profile, modId: inst.id }).catch(showErrorDialog)}
                                                                    title="Open mod folder"
                                                                >
                                                                    <DriveIcon /> Open Folder
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    className={`${styles.action_button} ${someFilesEnabled ? styles.browse_enabled_btn : styles.browse_disabled_btn}`}
                                                                    onClick={() => handleToggleEnabled(inst)}
                                                                    title={allFilesEnabled ? "Disable all files" : "Enable all files"}
                                                                >
                                                                    {allFilesEnabled ? "Enabled" : someFilesEnabled ? "Partial" : "Disabled"}
                                                                </button>
                                                            )
                                                        )}
                                                        {inst ? (
                                                            <button
                                                                className={`${styles.action_button} ${styles.action_button_danger}`}
                                                                onClick={() => handleDelete(inst)}
                                                            >
                                                                Remove
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className={`${styles.action_button} ${styles.browse_install_btn}`}
                                                                onClick={() => handleQuickInstall(modItem)}
                                                                disabled={pendingInstalls.has(modItem.id)}
                                                            >
                                                                {pendingInstalls.has(modItem.id) ? "Installing..." : "Install"}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* File sub-rows for per-file toggle */}
                                                {isMultiFile && isBrowseExpanded && (
                                                    <div className={styles.file_subrows}>
                                                        {inst.files.map((file) => (
                                                            <div
                                                                key={file.filename}
                                                                className={styles.file_subrow}
                                                            >
                                                                <div className={styles.file_subrow_info}>
                                                                    {file.type === "xml" ? (
                                                                        <span
                                                                            className={`${styles.file_subrow_name} ${styles.file_subrow_name_clickable}`}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleEditXmlFile(inst, file);
                                                                            }}
                                                                            title="Click to edit"
                                                                        >
                                                                            {file.filename}
                                                                        </span>
                                                                    ) : (
                                                                        <span className={styles.file_subrow_name}>{file.filename}</span>
                                                                    )}
                                                                    <span className={`${styles.file_type_badge} ${
                                                                        file.type === "s2z" ? styles.file_type_s2z
                                                                            : file.type === "xml" ? styles.file_type_xml
                                                                                : styles.file_type_other
                                                                    }`}>
                                                                        {file.type}
                                                                    </span>
                                                                    {file.size > 0 && (
                                                                        <span className={styles.file_subrow_size}>{formatFileSize(file.size)}</span>
                                                                    )}
                                                                </div>
                                                                <div className={styles.file_subrow_actions}>
                                                                    <button
                                                                        className={`${styles.file_toggle} ${file.enabled ? styles.file_toggle_on : styles.file_toggle_off}`}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleToggleFile(inst, file);
                                                                        }}
                                                                        title={file.enabled ? "Disable this file" : "Enable this file"}
                                                                    >
                                                                        {file.enabled ? "On" : "Off"}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className={styles.grid}>
                                    {data.items.map((modItem) => {
                                        const inst = installedByApiId.get(modItem.id);
                                        return (
                                            <ModCard
                                                key={modItem.id}
                                                mod={modItem}
                                                isInstalled={installedIdSet.has(modItem.id)}
                                                isEnabled={inst?.enabled}
                                                isTool={inst ? isToolMod(inst.files) : false}
                                                isPending={pendingInstalls.has(modItem.id)}
                                                channel={channel}
                                                onInstall={handleQuickInstall}
                                                onUninstall={(m) => {
                                                    const installed = installedByApiId.get(m.id);
                                                    if (installed) handleDelete(installed);
                                                }}
                                                onToggleEnabled={(m) => {
                                                    const installed = installedByApiId.get(m.id);
                                                    if (installed) handleToggleEnabled(installed);
                                                }}
                                                onOpenFolder={(m) => {
                                                    const installed = installedByApiId.get(m.id);
                                                    if (installed) invoke("reveal_mod_folder", { profile, modId: installed.id }).catch(showErrorDialog);
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                            {data.items.length < data.totalCount && (
                                <div className={styles.load_more} onClick={() => setPage(page + 1)}>
                                    Load More...
                                </div>
                            )}
                            {data.items.length === 0 && (
                                <div className={styles.empty}>
                                    <PuzzleIcon />
                                    No mods found.
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* ========== INSTALLED TAB ========== */}
            {subTab === "installed" && (
                <>
                    {/* Import mode */}
                    {importMode ? (
                        <div className={styles.import_panel}>
                            <div className={styles.import_header}>
                                <span style={{ fontWeight: 600, fontSize: 14 }}>Import Mods from Game Folder</span>
                                <button className={styles.import_cancel} onClick={() => setImportMode(false)}>Cancel</button>
                            </div>
                            <input
                                className={styles.import_group_input}
                                type="text"
                                placeholder="Group name (optional)"
                                value={importGroupName}
                                onChange={(e) => setImportGroupName(e.target.value)}
                            />
                            <div className={styles.import_hint}>
                                Select the .s2z files you want to import. Multiple files will be grouped into one mod.
                            </div>
                            <div className={styles.installed_list}>
                                {gameFiles.map((f) => (
                                    <label key={f.filename} className={styles.installed_row} style={{ cursor: "pointer" }}>
                                        <input
                                            type="checkbox"
                                            className={styles.installed_checkbox}
                                            checked={selectedImportFiles.has(f.filename)}
                                            onChange={(e) => {
                                                const next = new Set(selectedImportFiles);
                                                if (e.target.checked) next.add(f.filename);
                                                else next.delete(f.filename);
                                                setSelectedImportFiles(next);
                                            }}
                                        />
                                        <div className={styles.installed_info}>
                                            <span className={styles.installed_name}>{f.filename}</span>
                                            <span className={styles.installed_meta}>
                                                {(f.size / 1024).toFixed(1)} KB
                                            </span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                            <button
                                className={`${styles.action_button} ${styles.import_confirm}`}
                                disabled={selectedImportFiles.size === 0 || importing}
                                onClick={handleConfirmImport}
                            >
                                {importing ? "Importing..." : `Import ${selectedImportFiles.size} file${selectedImportFiles.size !== 1 ? "s" : ""}`}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className={styles.import_bar}>
                                <button
                                    className={`${styles.action_button} ${styles.import_button}`}
                                    onClick={handleStartImport}
                                    disabled={scanning}
                                >
                                    {scanning ? (
                                        <>
                                            <span className={styles.import_spinner} />
                                            Scanning...
                                        </>
                                    ) : "Import from Game Folder"}
                                </button>
                                <TooltipWrapper text="Scan your game folder for unmanaged mods that are able to be imported and managed by the launcher. Unmanaged local mods will continue to work as normal and be unaffected if you choose not to import them.">
                                    <InformationIcon className={styles.import_info_icon} />
                                </TooltipWrapper>
                                {noLocalMods && (
                                    <span className={styles.no_local_mods}>No local mods found.</span>
                                )}
                            </div>
                            {regularMods.length === 0 && toolMods.length === 0 && installedMaps.length === 0 ? (
                                <div className={styles.empty}>
                                    <PuzzleIcon />
                                    No mods installed yet. Browse and install mods from the Browse tab, or import existing mods from your game folder.
                                </div>
                            ) : (
                                <>
                                    {regularMods.length > 0 && (
                                        <div className={styles.installed_list}>
                                            <div className={styles.installed_header}>
                                                <span className={styles.header_order}>Order</span>
                                                <span className={styles.header_name}>Mod</span>
                                                <span className={styles.header_actions}>Actions</span>
                                            </div>
                                            {[...regularMods]
                                                .sort((a, b) => a.loadOrder - b.loadOrder)
                                                .map((mod, index) => {
                                                    const isMultiFile = mod.files.length > 1;
                                                    const isExpanded = expandedGroups.has(mod.id);
                                                    const allFilesEnabled = mod.files.every((f) => f.enabled);
                                                    const someFilesEnabled = mod.files.some((f) => f.enabled);
                                                    const isPartial = someFilesEnabled && !allFilesEnabled;

                                                    return (
                                                        <React.Fragment key={mod.id}>
                                                            <div
                                                                className={styles.installed_row}
                                                                style={{ cursor: "pointer" }}
                                                                onClick={() => {
                                                                    if (mod.apiModId) {
                                                                        navigate(`/mods/${mod.apiModId}?channel=${channel}`);
                                                                    } else {
                                                                        navigate(`/mods/custom/${mod.id}?channel=${channel}`);
                                                                    }
                                                                }}
                                                            >
                                                                {/* Load order controls */}
                                                                <div className={styles.installed_order} onClick={(e) => e.stopPropagation()}>
                                                                    <span className={styles.order_label}>{mod.loadOrder}</span>
                                                                    <button
                                                                        className={styles.order_button}
                                                                        onClick={() => handleMoveUp(mod.id, index)}
                                                                        disabled={index === 0}
                                                                        title="Move up (load earlier)"
                                                                    >
                                                                        ▲
                                                                    </button>
                                                                    <button
                                                                        className={styles.order_button}
                                                                        onClick={() => handleMoveDown(mod.id, index)}
                                                                        disabled={index === regularMods.length - 1}
                                                                        title="Move down (load later)"
                                                                    >
                                                                        ▼
                                                                    </button>
                                                                </div>

                                                                {/* Expand chevron (only for multi-file mods) */}
                                                                {isMultiFile && (
                                                                    <button
                                                                        className={`${styles.expand_chevron} ${isExpanded ? styles.expand_chevron_open : ""}`}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setExpandedGroups((prev) => {
                                                                                const next = new Set(prev);
                                                                                if (next.has(mod.id)) next.delete(mod.id);
                                                                                else next.add(mod.id);
                                                                                return next;
                                                                            });
                                                                        }}
                                                                        title={isExpanded ? "Collapse files" : "Expand files"}
                                                                    >
                                                                        <svg viewBox="0 0 8 12" fill="currentColor"><path d="M1.5 0L7.5 6L1.5 12L0 10.5L4.5 6L0 1.5L1.5 0Z"/></svg>
                                                                    </button>
                                                                )}

                                                                <div
                                                                    className={styles.installed_info}
                                                                >
                                                                    <span className={styles.installed_name}>
                                                                        {mod.name}
                                                                        {mod.isCustom && <span className={styles.custom_badge}>Imported</span>}
                                                                        {isMultiFile && <span className={styles.group_badge}>Mod Group</span>}
                                                                        {isPartial && <span className={styles.partial_badge}>Partial</span>}
                                                                    </span>
                                                                    {!mod.isCustom && (
                                                                        <span className={styles.installed_meta}>
                                                                            by {mod.author} &middot; v{mod.installedVersion} &middot; {mod.files.length} file{mod.files.length !== 1 ? "s" : ""}
                                                                            {isPartial && ` (${mod.files.filter((f) => f.enabled).length} enabled)`}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Actions */}
                                                                <div className={styles.installed_actions} onClick={(e) => e.stopPropagation()}>
                                                                    <button
                                                                        className={`${styles.action_button} ${someFilesEnabled ? styles.browse_enabled_btn : styles.browse_disabled_btn}`}
                                                                        onClick={() => handleToggleEnabled(mod)}
                                                                        title={allFilesEnabled ? "Disable all files" : "Enable all files"}
                                                                    >
                                                                        {someFilesEnabled ? "Enabled" : "Disabled"}
                                                                    </button>
                                                                    <button
                                                                        className={`${styles.action_button} ${styles.action_button_danger}`}
                                                                        onClick={() => handleDelete(mod)}
                                                                        title="Remove mod"
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* File sub-rows (only shown when expanded) */}
                                                            {isMultiFile && isExpanded && (
                                                                <div className={styles.file_subrows}>
                                                                    {mod.files.map((file) => (
                                                                        <div
                                                                            key={file.filename}
                                                                            className={styles.file_subrow}
                                                                        >
                                                                            <div className={styles.file_subrow_info}>
                                                                                {file.type === "xml" ? (
                                                                                    <span
                                                                                        className={`${styles.file_subrow_name} ${styles.file_subrow_name_clickable}`}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleEditXmlFile(mod, file);
                                                                                        }}
                                                                                        title="Click to edit"
                                                                                    >
                                                                                        {file.filename}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className={styles.file_subrow_name}>{file.filename}</span>
                                                                                )}
                                                                                <span className={`${styles.file_type_badge} ${
                                                                                    file.type === "s2z" ? styles.file_type_s2z
                                                                                        : file.type === "xml" ? styles.file_type_xml
                                                                                            : styles.file_type_other
                                                                                }`}>
                                                                                    {file.type}
                                                                                </span>
                                                                                {file.size > 0 && (
                                                                                    <span className={styles.file_subrow_size}>{formatFileSize(file.size)}</span>
                                                                                )}
                                                                            </div>
                                                                            <div className={styles.file_subrow_actions}>
                                                                                <button
                                                                                    className={`${styles.file_toggle} ${file.enabled ? styles.file_toggle_on : styles.file_toggle_off}`}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleToggleFile(mod, file);
                                                                                    }}
                                                                                    title={file.enabled ? "Disable this file" : "Enable this file"}
                                                                                >
                                                                                    {file.enabled ? "On" : "Off"}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                        </div>
                                    )}

                                    {/* Maps */}
                                    {installedMaps.length > 0 && (
                                        <div className={styles.installed_list}>
                                            <div className={styles.installed_header}>
                                                <span className={styles.header_name}>Maps</span>
                                                <span className={styles.header_actions}>Actions</span>
                                            </div>
                                            {installedMaps.map((map) => (
                                                <div
                                                    key={map.id}
                                                    className={styles.installed_row}
                                                    style={{ cursor: "pointer" }}
                                                    onClick={() => {
                                                        if (map.apiModId) {
                                                            navigate(`/mods/${map.apiModId}?channel=${channel}`);
                                                        }
                                                    }}
                                                >
                                                    <div className={styles.installed_info}>
                                                        <span className={styles.installed_name}>
                                                            {map.name}
                                                        </span>
                                                        <span className={styles.installed_meta}>
                                                            by {map.author} &middot; v{map.installedVersion} &middot; {map.files.length} file{map.files.length !== 1 ? "s" : ""}
                                                        </span>
                                                    </div>

                                                    <div className={styles.installed_actions} onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            className={`${styles.action_button} ${map.enabled ? styles.browse_enabled_btn : styles.browse_disabled_btn}`}
                                                            onClick={() => handleToggleMapEnabled(map)}
                                                            title={map.enabled ? "Disable map" : "Enable map"}
                                                        >
                                                            {map.enabled ? "Enabled" : "Disabled"}
                                                        </button>
                                                        <button
                                                            className={`${styles.action_button} ${styles.action_button_danger}`}
                                                            onClick={() => handleDeleteMap(map)}
                                                            title="Remove map"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Tool mods (no .s2z files) */}
                                    {toolMods.length > 0 && (
                                        <div className={styles.installed_list}>
                                            <div className={styles.installed_header}>
                                                <span className={styles.header_name}>Tools &amp; Utilities</span>
                                                <span className={styles.header_actions}>Actions</span>
                                            </div>
                                            {toolMods.map((mod) => (
                                                <div
                                                    key={mod.id}
                                                    className={styles.installed_row}
                                                    style={{ cursor: "pointer" }}
                                                    onClick={() => {
                                                        if (mod.apiModId) {
                                                            navigate(`/mods/${mod.apiModId}?channel=${channel}`);
                                                        } else {
                                                            navigate(`/mods/custom/${mod.id}?channel=${channel}`);
                                                        }
                                                    }}
                                                >
                                                    <div className={styles.installed_info}>
                                                        <span className={styles.installed_name}>
                                                            {mod.name}
                                                            <span className={styles.tool_badge}>Tool</span>
                                                        </span>
                                                        {!mod.isCustom && (
                                                            <span className={styles.installed_meta}>
                                                                by {mod.author} &middot; v{mod.installedVersion} &middot; {mod.files.length} file{mod.files.length !== 1 ? "s" : ""}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className={styles.installed_actions} onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            className={`${styles.action_button} ${styles.action_button_folder}`}
                                                            onClick={() => invoke("reveal_mod_folder", { profile, modId: mod.id }).catch(showErrorDialog)}
                                                            title="Open mod folder"
                                                        >
                                                            <DriveIcon /> Open Folder
                                                        </button>
                                                        <button
                                                            className={`${styles.action_button} ${styles.action_button_danger}`}
                                                            onClick={() => handleDelete(mod)}
                                                            title="Remove mod"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default ModsSection;
