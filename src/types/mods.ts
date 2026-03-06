// ============================================================
//  Mod Manager Types
// ============================================================

/** A single tag on a mod (e.g. "Graphics", "Sounds and Music"). */
export interface ModTag {
    id: number;
    name: string;
    slug: string;
    color: string;
    modCount: number;
}

/** A mod entry as returned by the list API (`/api/mods`). */
export interface ModListItem {
    id: number;
    name: string;
    slug: string;
    author: string;
    totalDownloads: number;
    isPinned: boolean;
    createdAt: string;
    updatedAt: string;
    primaryImageUrl: string | null;
    latestVersion: string;
    tags: ModTag[];
    /** "mod" (default) or "map" */
    modType?: string;
}

/** Paginated response from the mod list API. */
export interface ModListResponse {
    items: ModListItem[];
    totalCount: number;
    page: number;
    pageSize: number;
}

/** An image attached to a mod (returned in mod detail). */
export interface ModImage {
    id: number;
    modId: number;
    imageUrl: string;
    thumbnailUrl: string;
    displayOrder: number;
    isPrimary: boolean;
    createdAt: string;
}

/** A downloadable version of a mod (returned in mod detail). */
export interface ModVersion {
    id: number;
    modId: number;
    version: string;
    changelog: string;
    gameVersion: string;
    fileName: string;
    downloadUrl: string;
    fileSize: number;
    fileHash: string;
    downloadCount: number;
    isLatest: boolean;
    createdAt: string;
}

/** Full mod detail as returned by `/api/mods/{id}`. */
export interface ModDetail {
    id: number;
    name: string;
    slug: string;
    description: string;
    author: string;
    totalDownloads: number;
    createdAt: string;
    updatedAt: string;
    versions: ModVersion[];
    images: ModImage[];
    tags: ModTag[];
    /** "mod" (default) or "map" */
    modType?: string;
}

// ============================================================
//  Local / Installed mod types  (persisted in mods.json)
// ============================================================

/** A single file belonging to an installed mod. */
export interface InstalledModFile {
    /** The original filename (e.g. "resourcesWiwiUI.s2z") */
    filename: string;
    /** SHA-256 hash of the file */
    hash: string;
    /** "s2z" | "xml" | "map" | "other" */
    type: "s2z" | "xml" | "map" | "other";
}

/** An installed mod tracked by the launcher. */
export interface InstalledMod {
    /** Unique local identifier: slug for API mods, UUID/custom-* for custom */
    id: string;
    /** API mod ID (null for custom mods) */
    apiModId: number | null;
    /** Display name */
    name: string;
    /** Author name */
    author: string;
    /** Installed version string */
    installedVersion: string;
    /** API version ID (null for custom mods) */
    installedVersionId: number | null;
    /** Whether the mod is currently active in /game/ */
    enabled: boolean;
    /** Load order (1-based). Higher = loaded later. */
    loadOrder: number;
    /** List of files that belong to this mod */
    files: InstalledModFile[];
    /** Whether this is a user-added custom mod */
    isCustom: boolean;
    /** Whether this is a map (placed in /game/maps/ with no filename modifications) */
    isMap: boolean;
    /** ISO timestamp of when the mod was installed */
    installedAt: string;
}

/** The mods.json manifest stored on disk per channel. */
export interface ModManifest {
    /** Schema version (always 1 for now) */
    version: number;
    /** All installed mods */
    mods: InstalledMod[];
    /** Filenames to ignore during unknown-mod detection */
    ignoredFiles: string[];
}

// ============================================================
//  Rust backend ↔ Frontend DTOs
// ============================================================

/** Result from scanning the game folder for resources*.s2z files. */
export interface ScannedModFile {
    filename: string;
    hash: string;
    size: number;
}

/** Result from extracting a downloaded mod package. */
export interface ExtractedFile {
    filename: string;
    file_type: "s2z" | "xml" | "other";
}

/** An unknown mod file detected in /game/ that isn't tracked. */
export interface UnknownModFile {
    filename: string;
    hash: string;
    size: number;
}

/** Sort options for the mod browser. */
export type ModSortBy = "downloads" | "createdAt" | "name" | "updatedAt";

// ============================================================
//  Helpers
// ============================================================

/** Check if a mod/map should be treated as a Map based on its tags. */
export function isMapMod(tags: ModTag[]): boolean {
    return tags.some((t) => t.slug === "maps");
}

/** Check if a mod is a "tool" mod (no .s2z files — not part of load order). */
export function isToolMod(files: InstalledModFile[]): boolean {
    return files.length > 0 && !files.some((f) => f.type === "s2z");
}
