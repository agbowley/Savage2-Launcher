// ============================================================
//  Mod Manager – Tauri backend commands
//
//  Handles filesystem operations for the mod management feature:
//  - Mod directory management
//  - Game folder scanning for resources*.s2z files
//  - Mod manifest (mods.json) read/write
//  - Downloading mod files with progress
//  - Extracting mod packages (.zip)
//  - Enabling/disabling mods (copy to/from game folder)
//  - Load order management (filename-based reordering)
//  - Unknown mod detection via SHA-256 hashing
// ============================================================

use sha2::{Sha256, Digest};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::utils::{download, enrich_io_error};
use crate::InnerState;

// ============================================================
//  Types (serialised to/from frontend via JSON)
// ============================================================

fn default_true() -> bool { true }

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct InstalledModFile {
    pub filename: String,
    pub hash: String,
    #[serde(rename = "type")]
    pub file_type: String, // "s2z" | "xml" | "other"
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub modified: bool,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct InstalledMod {
    pub id: String,
    #[serde(rename = "apiModId")]
    pub api_mod_id: Option<u32>,
    pub name: String,
    pub author: String,
    #[serde(rename = "installedVersion")]
    pub installed_version: String,
    #[serde(rename = "installedVersionId")]
    pub installed_version_id: Option<u32>,
    pub enabled: bool,
    #[serde(rename = "loadOrder")]
    pub load_order: u32,
    pub files: Vec<InstalledModFile>,
    #[serde(rename = "isCustom")]
    pub is_custom: bool,
    #[serde(rename = "isMap")]
    #[serde(default)]
    pub is_map: bool,
    #[serde(rename = "installedAt")]
    pub installed_at: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ModManifest {
    pub version: u32,
    pub mods: Vec<InstalledMod>,
    #[serde(rename = "ignoredFiles", default)]
    pub ignored_files: Vec<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct ScannedModFile {
    pub filename: String,
    pub hash: String,
    pub size: u64,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct ExtractedFile {
    pub filename: String,
    pub file_type: String, // "s2z" | "xml" | "other"
    pub size: u64,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct UnknownModFile {
    pub filename: String,
    pub hash: String,
    pub size: u64,
}

// ============================================================
//  Helpers
// ============================================================

/// Compute SHA-256 hex digest of a file.
fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|e| format!("Failed to open file for hashing: {}\n{}", path.display(), e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let n = file.read(&mut buffer)
            .map_err(|e| format!("Failed to read file for hashing: {}\n{}", path.display(), e))?;
        if n == 0 { break; }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Return the mods directory for a given profile.
/// Creates it if it doesn't exist.
fn get_mods_dir_path(state: &InnerState, profile: &str) -> Result<PathBuf, String> {
    let mods_dir = state.launcher_folder.join("mods").join(profile);
    fs::create_dir_all(&mods_dir)
        .map_err(|e| enrich_io_error("Failed to create mods directory.", &e))?;
    Ok(mods_dir)
}

/// Return the game folder path for a given profile.
fn get_game_folder(state: &InnerState, profile: &str) -> PathBuf {
    let base = state.settings.profile_locations
        .get(profile)
        .map(|s| PathBuf::from(s))
        .unwrap_or_else(|| {
            match profile {
                "latest" => state.local_data_dir.join("Savage 2 CE"),
                "beta"   => state.local_data_dir.join("Savage 2 CE - Beta"),
                "legacy" => state.local_data_dir.join("Savage 2 Legacy"),
                _        => state.local_data_dir.join("Savage 2 CE"),
            }
        });
    base.join("game")
}

/// Return the /game/maps/ folder path for a given profile.
fn get_maps_folder(state: &InnerState, profile: &str) -> PathBuf {
    get_game_folder(state, profile).join("maps")
}

/// Check if a filename looks like a mod resources file.
/// Must start with "resources" (case-insensitive) and end with ".s2z".
fn is_resources_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.starts_with("resources") && lower.ends_with(".s2z")
}

/// Load the mods manifest from disk, returning a default if it doesn't exist.
fn load_manifest_from_disk(mods_dir: &Path) -> ModManifest {
    let manifest_path = mods_dir.join("mods.json");
    if manifest_path.exists() {
        if let Ok(text) = fs::read_to_string(&manifest_path) {
            if let Ok(manifest) = serde_json::from_str::<ModManifest>(&text) {
                return manifest;
            }
        }
    }
    ModManifest {
        version: 1,
        mods: Vec::new(),
        ignored_files: Vec::new(),
    }
}

/// Save the mods manifest to disk.
fn save_manifest_to_disk(mods_dir: &Path, manifest: &ModManifest) -> Result<(), String> {
    let manifest_path = mods_dir.join("mods.json");
    let json = serde_json::to_string_pretty(manifest)
        .map_err(|e| format!("Failed to serialise mods manifest.\n{}", e))?;
    fs::write(&manifest_path, json)
        .map_err(|e| enrich_io_error("Failed to write mods manifest.", &e))?;
    Ok(())
}

// ============================================================
//  Tauri Commands
// ============================================================

/// Return the path to the mods directory for a given profile (creates if needed).
#[tauri::command]
pub fn get_mods_dir(
    state: tauri::State<crate::State>,
    profile: String,
) -> Result<String, String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let dir = get_mods_dir_path(&inner, &profile)?;
    Ok(dir.to_string_lossy().to_string())
}

/// Scan the game's /game/ folder for resources*.s2z files.
/// Returns metadata for each file found (excluding resources0.s2z).
#[tauri::command]
pub fn scan_game_mods(
    state: tauri::State<crate::State>,
    profile: String,
) -> Result<Vec<ScannedModFile>, String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let game_folder = get_game_folder(&inner, &profile);

    if !game_folder.exists() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let entries = fs::read_dir(&game_folder)
        .map_err(|e| format!("Failed to read game folder: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }

        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        // Skip resources0.s2z (the base game)
        if name.to_lowercase() == "resources0.s2z" { continue; }

        let lower = name.to_lowercase();
        if is_resources_file(&name) || lower.ends_with(".xml") {
            let metadata = fs::metadata(&path)
                .map_err(|e| format!("Failed to read metadata for {}: {}", name, e))?;
            let hash = sha256_file(&path)?;
            results.push(ScannedModFile {
                filename: name,
                hash,
                size: metadata.len(),
            });
        }
    }

    Ok(results)
}

/// Load the mods manifest (mods.json) for a given profile.
#[tauri::command]
pub fn load_mod_manifest(
    state: tauri::State<crate::State>,
    profile: String,
) -> Result<ModManifest, String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    Ok(load_manifest_from_disk(&mods_dir))
}

/// Save the mods manifest (mods.json) for a given profile.
#[tauri::command]
pub fn save_mod_manifest(
    state: tauri::State<crate::State>,
    profile: String,
    manifest: ModManifest,
) -> Result<(), String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    save_manifest_to_disk(&mods_dir, &manifest)
}

/// Download a mod file from a URL to the mods staging directory.
/// Emits progress events using the same "progress_info" channel.
#[tauri::command]
pub async fn download_mod_file(
    app: AppHandle,
    state: tauri::State<'_, crate::State>,
    profile: String,
    mod_id: String,
    url: String,
    filename: String,
) -> Result<String, String> {
    let (mods_dir, cancel_token) = {
        let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
        inner.cancel_token.reset();
        let dir = get_mods_dir_path(&inner, &profile)?;
        (dir, inner.cancel_token.clone())
    };

    // Create mod-specific subfolder
    let mod_dir = mods_dir.join(&mod_id);
    fs::create_dir_all(&mod_dir)
        .map_err(|e| enrich_io_error("Failed to create mod directory.", &e))?;

    let dest_path = mod_dir.join(&filename);

    download(
        Some(&app),
        &url,
        &dest_path,
        Some(&cancel_token),
    ).await?;

    Ok(dest_path.to_string_lossy().to_string())
}

/// Extract a downloaded mod package (.zip) and return the list of files found.
/// Scans for .s2z and .xml files within the extracted contents.
#[tauri::command]
pub fn extract_mod_package(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
    archive_filename: String,
) -> Result<Vec<ExtractedFile>, String> {
    let mods_dir = {
        let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
        get_mods_dir_path(&inner, &profile)?
    };

    let mod_dir = mods_dir.join(&mod_id);
    let archive_path = mod_dir.join(&archive_filename);

    if !archive_path.exists() {
        return Err(format!("Archive not found: {}", archive_path.display()));
    }

    // Determine if this is a zip that needs extraction or already an s2z
    let lower_name = archive_filename.to_lowercase();
    if lower_name.ends_with(".s2z") {
        // Already an s2z file, no extraction needed
        let file_size = fs::metadata(&archive_path).map(|m| m.len()).unwrap_or(0);
        return Ok(vec![ExtractedFile {
            filename: archive_filename,
            file_type: "s2z".to_string(),
            size: file_size,
        }]);
    }

    if !lower_name.ends_with(".zip") {
        // Not a zip — treat as an opaque file
        let file_size = fs::metadata(&archive_path).map(|m| m.len()).unwrap_or(0);
        return Ok(vec![ExtractedFile {
            filename: archive_filename,
            file_type: "other".to_string(),
            size: file_size,
        }]);
    }

    // Extract the zip into the mod directory
    let extract_dir = mod_dir.join("extracted");
    fs::create_dir_all(&extract_dir)
        .map_err(|e| enrich_io_error("Failed to create extraction directory.", &e))?;

    let file = File::open(&archive_path)
        .map_err(|e| format!("Failed to open archive: {}", e))?;
    zip_extract::extract(file, &extract_dir, true)
        .map_err(|e| format!("Failed to extract archive: {}", e))?;

    // Recursively find all .s2z and .xml files
    let mut results = Vec::new();
    collect_mod_files(&extract_dir, &extract_dir, &mut results)?;

    // Move discovered files to the mod directory root for easy access
    for item in &results {
        let src = extract_dir.join(&item.filename);
        let dest_name = Path::new(&item.filename)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let dest = mod_dir.join(&dest_name);
        if src != dest {
            fs::copy(&src, &dest)
                .map_err(|e| format!("Failed to copy {} to mod dir: {}", item.filename, e))?;
        }
    }

    // Clean up extraction directory and archive
    let _ = fs::remove_dir_all(&extract_dir);
    let _ = fs::remove_file(&archive_path);

    // Return with flattened filenames (just basenames)
    let flat_results: Vec<ExtractedFile> = results.iter().map(|f| {
        let base = Path::new(&f.filename)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        ExtractedFile {
            filename: base,
            file_type: f.file_type.clone(),
            size: f.size,
        }
    }).collect();

    Ok(flat_results)
}

/// Recursively collect all files from a directory.
fn collect_mod_files(base: &Path, dir: &Path, results: &mut Vec<ExtractedFile>) -> Result<(), String> {
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_mod_files(base, &path, results)?;
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            let lower = name.to_lowercase();
            let file_type = if lower.ends_with(".s2z") {
                "s2z"
            } else if lower.ends_with(".xml") {
                "xml"
            } else {
                "other"
            };

            let rel_path = path.strip_prefix(base)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();

            let file_size = fs::metadata(&path)
                .map(|m| m.len())
                .unwrap_or(0);

            results.push(ExtractedFile {
                filename: rel_path,
                file_type: file_type.to_string(),
                size: file_size,
            });
        }
    }

    Ok(())
}

/// Enable a mod: copy its files from the mods staging directory into /game/.
/// .s2z files are renamed with a load-order prefix (e.g. resources3-Foo.s2z).
/// Non-.s2z files (e.g. .xml) are copied with their original filename.
/// Returns a list of non-.s2z filenames that conflicted (were overwritten).
///
/// When `filenames` is provided, only those files are copied (for per-file control).
#[tauri::command]
pub fn enable_mod(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
    load_order: u32,
    filenames: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let game_folder = get_game_folder(&inner, &profile);
    let mod_dir = mods_dir.join(&mod_id);

    if !mod_dir.exists() {
        return Err(format!("Mod directory not found: {}", mod_dir.display()));
    }

    fs::create_dir_all(&game_folder)
        .map_err(|e| enrich_io_error("Failed to create game folder.", &e))?;

    // Build a lowercase filter set if filenames were provided
    let filter: Option<std::collections::HashSet<String>> = filenames.map(|fns| {
        fns.iter().map(|f| f.to_lowercase()).collect()
    });

    // Scan the mod staging directory for .s2z and .xml files
    let entries = fs::read_dir(&mod_dir)
        .map_err(|e| format!("Failed to read mod directory: {}", e))?;

    let mut conflicts: Vec<String> = Vec::new();
    let mut copied: Vec<PathBuf> = Vec::new(); // track for rollback

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }

        let filename = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        let lower = filename.to_lowercase();
        if !lower.ends_with(".s2z") && !lower.ends_with(".xml") {
            continue;
        }

        // Skip files not in the filter set (if a filter was provided)
        if let Some(ref allowed) = filter {
            if !allowed.contains(&lower) {
                continue;
            }
        }

        if lower.ends_with(".s2z") {
            // .s2z files get load-order prefix
            let dest_name = make_ordered_filename(&filename, load_order);
            let dest = game_folder.join(&dest_name);
            if let Err(e) = fs::copy(&path, &dest) {
                // Rollback: remove all files we already copied
                for p in &copied { let _ = fs::remove_file(p); }
                return Err(enrich_io_error(
                    &format!("Failed to copy mod file '{}' to game folder.", filename),
                    &e,
                ));
            }
            copied.push(dest);
        } else {
            // Non-.s2z files keep original name, check for conflicts
            let dest = game_folder.join(&filename);
            if dest.exists() {
                conflicts.push(filename.clone());
            }
            if let Err(e) = fs::copy(&path, &dest) {
                for p in &copied { let _ = fs::remove_file(p); }
                return Err(enrich_io_error(
                    &format!("Failed to copy mod file '{}' to game folder.", filename),
                    &e,
                ));
            }
            copied.push(dest);
        }
    }

    Ok(conflicts)
}

/// Disable a mod: remove its files from the /game/ folder.
/// The originals remain safe in the mods staging directory.
#[tauri::command]
pub fn disable_mod(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
) -> Result<(), String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let game_folder = get_game_folder(&inner, &profile);
    let mod_dir = mods_dir.join(&mod_id);

    if !game_folder.exists() {
        return Ok(()); // Nothing to remove
    }

    // Build set of base filenames from the mod staging directory
    let mut mod_basenames: Vec<String> = Vec::new();
    let mut mod_exact_names: Vec<String> = Vec::new();
    if mod_dir.exists() {
        if let Ok(entries) = fs::read_dir(&mod_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() { continue; }
                let ext_lower = path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if ext_lower == "s2z" {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        mod_basenames.push(stem.to_lowercase());
                    }
                } else if ext_lower == "xml" {
                    // Non-.s2z files are matched by exact filename
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        mod_exact_names.push(name.to_lowercase());
                    }
                }
            }
        }
    }

    if mod_basenames.is_empty() && mod_exact_names.is_empty() {
        // Fallback: try reading the manifest
        let manifest = load_manifest_from_disk(&mods_dir);
        if let Some(mod_entry) = manifest.mods.iter().find(|m| m.id == mod_id) {
            for f in &mod_entry.files {
                let lower = f.filename.to_lowercase();
                if lower.ends_with(".s2z") {
                    if let Some(stem) = Path::new(&f.filename).file_stem().and_then(|s| s.to_str()) {
                        mod_basenames.push(stem.to_lowercase());
                    }
                } else {
                    mod_exact_names.push(lower);
                }
            }
        }
    }

    // First pass: collect all game-folder files that belong to this mod
    let mut to_remove: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = fs::read_dir(&game_folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() { continue; }

            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            let lower_name = name.to_lowercase();

            // Check exact match for non-.s2z files (e.g. .xml)
            if mod_exact_names.iter().any(|n| *n == lower_name) {
                to_remove.push(path);
                continue;
            }

            // Check .s2z files with order prefix/suffix stripping
            let stem = Path::new(&name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();

            let base_from_suffix = strip_order_suffix(&stem);
            let base_from_prefix = strip_order_prefix(&stem);

            if mod_basenames.iter().any(|b| *b == base_from_suffix || *b == base_from_prefix) {
                to_remove.push(path);
            }
        }
    }

    // Second pass: remove files, tracking what was removed for rollback
    let mut removed: Vec<(PathBuf, Vec<u8>)> = Vec::new(); // (path, contents)
    for path in &to_remove {
        // Read file contents before removing so we can restore on failure
        let contents = fs::read(path).unwrap_or_default();
        if let Err(e) = fs::remove_file(path) {
            // Rollback: restore all previously removed files
            for (restored_path, restored_contents) in &removed {
                let _ = fs::write(restored_path, restored_contents);
            }
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("?");
            return Err(format!(
                "Cannot remove '{}': the file is locked by another process.\n\
                 Close the game and try again.\n{}",
                name, e
            ));
        }
        removed.push((path.clone(), contents));
    }

    Ok(())
}

/// Enable a single file within a mod: copy it from the staging directory into /game/.
/// .s2z files are renamed with a load-order prefix.
#[tauri::command]
pub fn enable_mod_file(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
    filename: String,
    load_order: u32,
) -> Result<Vec<String>, String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let game_folder = get_game_folder(&inner, &profile);
    let mod_dir = mods_dir.join(&mod_id);

    let src = mod_dir.join(&filename);
    if !src.exists() {
        return Err(format!("File not found in staging: {}", filename));
    }

    fs::create_dir_all(&game_folder)
        .map_err(|e| enrich_io_error("Failed to create game folder.", &e))?;

    let lower = filename.to_lowercase();
    let mut conflicts: Vec<String> = Vec::new();

    if lower.ends_with(".s2z") {
        let dest_name = make_ordered_filename(&filename, load_order);
        let dest = game_folder.join(&dest_name);
        fs::copy(&src, &dest)
            .map_err(|e| enrich_io_error(
                &format!("Failed to copy mod file '{}' to game folder.", filename),
                &e,
            ))?;
    } else {
        let dest = game_folder.join(&filename);
        if dest.exists() {
            conflicts.push(filename.clone());
        }
        fs::copy(&src, &dest)
            .map_err(|e| enrich_io_error(
                &format!("Failed to copy mod file '{}' to game folder.", filename),
                &e,
            ))?;
    }

    Ok(conflicts)
}

/// Disable a single file within a mod: remove it from the /game/ folder.
#[tauri::command]
pub fn disable_mod_file(
    state: tauri::State<crate::State>,
    profile: String,
    _mod_id: String,
    filename: String,
) -> Result<(), String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let game_folder = get_game_folder(&inner, &profile);

    if !game_folder.exists() {
        return Ok(());
    }

    let lower = filename.to_lowercase();

    if lower.ends_with(".s2z") {
        // Need to find the file in /game/ — it has a load-order prefix/suffix
        let stem = Path::new(&filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        if let Ok(entries) = fs::read_dir(&game_folder) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() { continue; }
                let name = match path.file_name().and_then(|n| n.to_str()) {
                    Some(n) => n.to_string(),
                    None => continue,
                };
                let game_stem = Path::new(&name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                let base_suffix = strip_order_suffix(&game_stem);
                let base_prefix = strip_order_prefix(&game_stem);

                if base_suffix == stem || base_prefix == stem {
                    fs::remove_file(&path).map_err(|e| format!(
                        "Cannot remove '{}': the file is locked by another process.\n\
                         Close the game and try again.\n{}",
                        name, e
                    ))?;
                }
            }
        }
    } else {
        // Exact-match removal for non-.s2z files
        let dest = game_folder.join(&filename);
        if dest.exists() {
            fs::remove_file(&dest).map_err(|e| format!(
                "Cannot remove '{}': the file is locked by another process.\n\
                 Close the game and try again.\n{}",
                filename, e
            ))?;
        }
    }

    Ok(())
}

/// Reorder a mod's files in /game/ by renaming them with the new load-order.
#[tauri::command]
pub fn reorder_mod(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
    old_load_order: u32,
    new_load_order: u32,
) -> Result<(), String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let game_folder = get_game_folder(&inner, &profile);
    let mod_dir = mods_dir.join(&mod_id);

    if !game_folder.exists() {
        return Ok(());
    }

    // Scan the mod staging directory for canonical filenames (only .s2z files are reordered)
    let mut mod_files: Vec<String> = Vec::new();
    if mod_dir.exists() {
        if let Ok(entries) = fs::read_dir(&mod_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() { continue; }
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let lower = name.to_lowercase();
                    // Only .s2z files get load-order naming; non-.s2z keep original name
                    if lower.ends_with(".s2z") {
                        mod_files.push(name.to_string());
                    }
                }
            }
        }
    }

    let mut renamed: Vec<(PathBuf, PathBuf)> = Vec::new(); // (new_path, original_path) for rollback

    for filename in &mod_files {
        let new_name = make_ordered_filename(filename, new_load_order);
        let new_path = game_folder.join(&new_name);

        // Try current prefix format first, then fall back to legacy suffix format
        let old_name = make_ordered_filename(filename, old_load_order);
        let old_path = game_folder.join(&old_name);

        let (source, source_name) = if old_path.exists() {
            (old_path, old_name)
        } else {
            let legacy_name = make_ordered_filename_legacy(filename, old_load_order);
            let legacy_path = game_folder.join(&legacy_name);
            if legacy_path.exists() {
                (legacy_path, legacy_name)
            } else {
                continue; // file not found in game folder, skip
            }
        };

        if let Err(e) = fs::rename(&source, &new_path) {
            // Rollback: reverse all previous renames
            for (rn_new, rn_old) in renamed.iter().rev() {
                let _ = fs::rename(rn_new, rn_old);
            }
            return Err(format!(
                "Cannot rename '{}': the file is locked by another process.\n\
                 Close the game and try again.\n{}",
                source_name, e
            ));
        }
        renamed.push((new_path, source));
    }

    Ok(())
}

/// Compute SHA-256 hash of a single file.
#[tauri::command]
pub fn hash_file(path: String) -> Result<String, String> {
    sha256_file(Path::new(&path))
}

/// Detect unknown mod files in /game/ that aren't tracked in the manifest.
#[tauri::command]
pub fn detect_unknown_mods(
    state: tauri::State<crate::State>,
    profile: String,
) -> Result<Vec<UnknownModFile>, String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let game_folder = get_game_folder(&inner, &profile);

    if !game_folder.exists() {
        return Ok(Vec::new());
    }

    let manifest = load_manifest_from_disk(&mods_dir);

    // Build a set of all known filenames (with any load-order suffix stripped)
    let mut known_basenames: std::collections::HashSet<String> = std::collections::HashSet::new();
    for m in &manifest.mods {
        for f in &m.files {
            let stem = Path::new(&f.filename)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            known_basenames.insert(stem);
        }
    }

    // Also include ignored files
    let ignored: std::collections::HashSet<String> = manifest.ignored_files.iter()
        .map(|f| f.to_lowercase())
        .collect();

    // Build exact-match set for non-.s2z files (e.g. .xml)
    let mut known_exact: std::collections::HashSet<String> = std::collections::HashSet::new();
    for m in &manifest.mods {
        for f in &m.files {
            if !f.filename.to_lowercase().ends_with(".s2z") {
                known_exact.insert(f.filename.to_lowercase());
            }
        }
    }

    let mut unknown = Vec::new();
    let entries = fs::read_dir(&game_folder)
        .map_err(|e| format!("Failed to read game folder: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }

        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        // Skip resources0.s2z
        if name.to_lowercase() == "resources0.s2z" { continue; }
        // Skip ignored files
        if ignored.contains(&name.to_lowercase()) { continue; }

        let lower_name = name.to_lowercase();

        if lower_name.ends_with(".xml") {
            // XML files: exact match
            if !known_exact.contains(&lower_name) {
                let metadata = fs::metadata(&path)
                    .map_err(|e| format!("Failed to get metadata for {}: {}", name, e))?;
                let hash = sha256_file(&path)?;
                unknown.push(UnknownModFile {
                    filename: name,
                    hash,
                    size: metadata.len(),
                });
            }
        } else if is_resources_file(&name) {
            let stem = Path::new(&name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            let base_from_suffix = strip_order_suffix(&stem);
            let base_from_prefix = strip_order_prefix(&stem);

            if !known_basenames.contains(&base_from_suffix) && !known_basenames.contains(&base_from_prefix) {
                let metadata = fs::metadata(&path)
                    .map_err(|e| format!("Failed to get metadata for {}: {}", name, e))?;
                let hash = sha256_file(&path)?;
                unknown.push(UnknownModFile {
                    filename: name,
                    hash,
                    size: metadata.len(),
                });
            }
        }
    }

    Ok(unknown)
}

/// Get the game folder path for a profile.
#[tauri::command]
pub fn get_game_folder_path(
    state: tauri::State<crate::State>,
    profile: String,
) -> Result<String, String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let folder = get_game_folder(&inner, &profile);
    Ok(folder.to_string_lossy().to_string())
}

/// Uninstall a mod: remove files from /game/ and delete the mod staging directory.
#[tauri::command]
pub fn uninstall_mod(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
) -> Result<(), String> {
    // First disable (remove from /game/)
    disable_mod(state.clone(), profile.clone(), mod_id.clone())?;

    // Then remove the staging directory
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let mod_dir = mods_dir.join(&mod_id);
    if mod_dir.exists() {
        let _ = fs::remove_dir_all(&mod_dir);
    }

    Ok(())
}

/// Reveal the mod staging folder (or the profile mods root) in the file explorer.
#[tauri::command]
pub fn reveal_mod_folder(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: Option<String>,
) -> Result<(), String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let folder = match mod_id {
        Some(id) => mods_dir.join(id),
        None => mods_dir,
    };
    if !folder.exists() {
        return Err("The mod folder does not exist on disk.".to_string());
    }
    if let Err(_e) = opener::reveal(&folder) {
        opener::open(&folder)
            .map_err(|e| format!("Failed to open folder.\n{}", e))?;
    }
    Ok(())
}

/// Get the absolute path to a mod's staging folder.
#[tauri::command]
pub fn get_mod_folder_path(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
) -> Result<String, String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let mod_dir = mods_dir.join(&mod_id);
    Ok(mod_dir.to_string_lossy().to_string())
}

/// Import mod files from the game folder into a new custom mod staging directory.
/// The files are **moved** (copied then removed) from /game/ to staging so that
/// enable_mod can place them back with proper load-order naming without duplicates.
#[tauri::command]
pub fn import_mod_files(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
    filenames: Vec<String>,
) -> Result<Vec<InstalledModFile>, String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let game_folder = get_game_folder(&inner, &profile);
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let mod_dir = mods_dir.join(&mod_id);
    fs::create_dir_all(&mod_dir)
        .map_err(|e| enrich_io_error("Failed to create custom mod directory.", &e))?;

    let mut imported: Vec<InstalledModFile> = Vec::new();

    for filename in &filenames {
        let src = game_folder.join(filename);
        if !src.exists() {
            return Err(format!("File not found in game folder: {}", filename));
        }
        let dest = mod_dir.join(filename);
        fs::copy(&src, &dest)
            .map_err(|e| enrich_io_error(&format!("Failed to copy {} to staging.", filename), &e))?;

        // Remove the original from /game/ so enable_mod doesn't create a duplicate
        fs::remove_file(&src).map_err(|e| format!(
            "Cannot remove '{}' from game folder: the file is locked by another process.\n\
             Close the game and try again.\n{}",
            filename, e
        ))?;

        let hash = sha256_file(&dest)?;
        let metadata = fs::metadata(&dest)
            .map_err(|e| format!("Failed to read metadata for {}: {}", filename, e))?;
        let ext = Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        imported.push(InstalledModFile {
            filename: filename.clone(),
            hash,
            file_type: ext,
            enabled: true,
            size: metadata.len(),
            modified: false,
        });
    }

    Ok(imported)
}

/// Restore a mod's filenames in /game/ back to their originals (strip load-order prefix).
/// Used when removing a custom mod from the index without deleting its files.
#[tauri::command]
pub fn restore_mod_filenames(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
    load_order: u32,
) -> Result<(), String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let game_folder = get_game_folder(&inner, &profile);
    let mod_dir = mods_dir.join(&mod_id);

    if !game_folder.exists() {
        return Ok(());
    }

    // Collect original filenames from staging directory
    let mut s2z_files: Vec<String> = Vec::new();
    if mod_dir.exists() {
        if let Ok(entries) = fs::read_dir(&mod_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() { continue; }
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let lower = name.to_lowercase();
                    if lower.ends_with(".s2z") {
                        s2z_files.push(name.to_string());
                    }
                }
            }
        }
    }

    // Rename each ordered file in /game/ back to the original staging name
    let mut renamed: Vec<(PathBuf, PathBuf)> = Vec::new(); // (new_path, original_path) for rollback

    for filename in &s2z_files {
        let original_dest = game_folder.join(filename);

        // Try current prefix format
        let ordered_name = make_ordered_filename(filename, load_order);
        let ordered_path = game_folder.join(&ordered_name);
        if ordered_path.exists() {
            if let Err(e) = fs::rename(&ordered_path, &original_dest) {
                for (rn_new, rn_old) in renamed.iter().rev() {
                    let _ = fs::rename(rn_new, rn_old);
                }
                return Err(format!(
                    "Cannot rename '{}': the file is locked by another process.\n\
                     Close the game and try again.\n{}",
                    ordered_name, e
                ));
            }
            renamed.push((original_dest, ordered_path));
            continue;
        }

        // Try legacy suffix format
        let legacy_name = make_ordered_filename_legacy(filename, load_order);
        let legacy_path = game_folder.join(&legacy_name);
        if legacy_path.exists() {
            if let Err(e) = fs::rename(&legacy_path, &original_dest) {
                for (rn_new, rn_old) in renamed.iter().rev() {
                    let _ = fs::rename(rn_new, rn_old);
                }
                return Err(format!(
                    "Cannot rename '{}': the file is locked by another process.\n\
                     Close the game and try again.\n{}",
                    legacy_name, e
                ));
            }
            renamed.push((original_dest, legacy_path));
        }
    }

    Ok(())
}

/// Delete the physical files of a custom mod from the staging directory.
/// Called when the user chooses to delete files on disk during mod removal.
#[tauri::command]
pub fn delete_mod_files(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
) -> Result<(), String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let mod_dir = mods_dir.join(&mod_id);
    if mod_dir.exists() {
        fs::remove_dir_all(&mod_dir)
            .map_err(|e| enrich_io_error("Failed to delete mod files.", &e))?;
    }
    Ok(())
}

/// Enable a map: copy its files from the mods staging directory into /game/maps/.
/// Files are copied with their original filename (no load-order prefix).
#[tauri::command]
pub fn enable_map(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
) -> Result<(), String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let maps_folder = get_maps_folder(&inner, &profile);
    let mod_dir = mods_dir.join(&mod_id);

    if !mod_dir.exists() {
        return Err(format!("Map directory not found: {}", mod_dir.display()));
    }

    fs::create_dir_all(&maps_folder)
        .map_err(|e| enrich_io_error("Failed to create maps folder.", &e))?;

    let entries = fs::read_dir(&mod_dir)
        .map_err(|e| format!("Failed to read map directory: {}", e))?;

    let mut copied: Vec<PathBuf> = Vec::new(); // track for rollback

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }

        let filename = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        // Copy all files with their original filename
        let dest = maps_folder.join(&filename);
        if let Err(e) = fs::copy(&path, &dest) {
            // Rollback: remove all files we already copied
            for p in &copied { let _ = fs::remove_file(p); }
            return Err(enrich_io_error(
                &format!("Failed to copy map file '{}' to maps folder.", filename),
                &e,
            ));
        }
        copied.push(dest);
    }

    Ok(())
}

/// Disable a map: remove its files from the /game/maps/ folder.
#[tauri::command]
pub fn disable_map(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
) -> Result<(), String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let maps_folder = get_maps_folder(&inner, &profile);
    let mod_dir = mods_dir.join(&mod_id);

    if !maps_folder.exists() {
        return Ok(());
    }

    // Build set of exact filenames from the mod staging directory
    let mut mod_filenames: Vec<String> = Vec::new();
    if mod_dir.exists() {
        if let Ok(entries) = fs::read_dir(&mod_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() { continue; }
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    mod_filenames.push(name.to_lowercase());
                }
            }
        }
    }

    if mod_filenames.is_empty() {
        // Fallback: try reading the manifest
        let manifest = load_manifest_from_disk(&mods_dir);
        if let Some(mod_entry) = manifest.mods.iter().find(|m| m.id == mod_id) {
            for f in &mod_entry.files {
                mod_filenames.push(f.filename.to_lowercase());
            }
        }
    }

    // First pass: collect matching file paths
    let mut to_remove: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = fs::read_dir(&maps_folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() { continue; }

            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            if mod_filenames.iter().any(|n| *n == name.to_lowercase()) {
                to_remove.push(path);
            }
        }
    }

    // Second pass: remove files with rollback
    let mut removed: Vec<(PathBuf, Vec<u8>)> = Vec::new();
    for path in &to_remove {
        let contents = fs::read(path).unwrap_or_default();
        if let Err(e) = fs::remove_file(path) {
            // Rollback: restore previously removed files
            for (restored_path, restored_contents) in &removed {
                let _ = fs::write(restored_path, restored_contents);
            }
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("?");
            return Err(format!(
                "Cannot remove '{}': the file is locked by another process.\n\
                 Close the game and try again.\n{}",
                name, e
            ));
        }
        removed.push((path.clone(), contents));
    }

    Ok(())
}

/// Uninstall a map: remove files from /game/maps/ and delete the mod staging directory.
#[tauri::command]
pub fn uninstall_map(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
) -> Result<(), String> {
    disable_map(state.clone(), profile.clone(), mod_id.clone())?;

    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let mod_dir = mods_dir.join(&mod_id);
    if mod_dir.exists() {
        let _ = fs::remove_dir_all(&mod_dir);
    }

    Ok(())
}

// ============================================================
//  Filename ordering helpers
// ============================================================

/// Create an ordered filename by embedding load-order into the name.
/// For resources*.s2z files, uses prefix ordering so alphabetical sort respects load order:
///   "resourcesFoo.s2z" + order 3 → "resources3-Foo.s2z"
/// For other files (.xml etc), uses suffix ordering:
///   "config.xml" + order 3 → "config-3.xml"
fn make_ordered_filename(original: &str, order: u32) -> String {
    let path = Path::new(original);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(original);
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    // For resources files with content after "resources", use prefix ordering
    if stem.len() > "resources".len()
        && stem[.."resources".len()].eq_ignore_ascii_case("resources")
    {
        let rest = &stem["resources".len()..];
        if ext.is_empty() {
            format!("resources{}-{}", order, rest)
        } else {
            format!("resources{}-{}.{}", order, rest, ext)
        }
    } else if ext.is_empty() {
        format!("{}-{}", stem, order)
    } else {
        format!("{}-{}.{}", stem, order, ext)
    }
}

/// Legacy ordered filename format (suffix-based for all files).
/// Used as fallback when searching for files created before the prefix format change.
/// e.g. "resourcesFoo.s2z" + order 3 → "resourcesFoo-3.s2z"
fn make_ordered_filename_legacy(original: &str, order: u32) -> String {
    let path = Path::new(original);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(original);
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if ext.is_empty() {
        format!("{}-{}", stem, order)
    } else {
        format!("{}-{}.{}", stem, order, ext)
    }
}

/// Strip an old-style load-order suffix from a file stem.
/// e.g. "resourcesfoo-3" → "resourcesfoo", "resourcesfoo" → "resourcesfoo"
fn strip_order_suffix(stem: &str) -> String {
    if let Some(pos) = stem.rfind('-') {
        let suffix = &stem[pos + 1..];
        if !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()) {
            return stem[..pos].to_string();
        }
    }
    stem.to_string()
}

/// Strip a new-style load-order prefix from a resources file stem.
/// e.g. "resources3-foo" → "resourcesfoo", "config-3" → "config-3" (unchanged)
fn strip_order_prefix(stem: &str) -> String {
    if stem.starts_with("resources") {
        let after = &stem["resources".len()..];
        if let Some(dash_pos) = after.find('-') {
            let potential_order = &after[..dash_pos];
            if !potential_order.is_empty() && potential_order.chars().all(|c| c.is_ascii_digit()) {
                return format!("resources{}", &after[dash_pos + 1..]);
            }
        }
    }
    stem.to_string()
}

// ============================================================
//  Mod file content read/write (for XML editor)
// ============================================================

/// Read the text content of a mod file from the staging directory.
#[tauri::command]
pub fn read_mod_file_content(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
    filename: String,
) -> Result<String, String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let file_path = mods_dir.join(&mod_id).join(&filename);

    if !file_path.exists() {
        return Err(format!("File not found: {}", file_path.display()));
    }

    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}\n{}", file_path.display(), e))
}

/// Write modified text content to a mod file in the staging directory,
/// re-compute its SHA-256 hash, and if the file is currently enabled,
/// copy the updated version into the game folder.
#[tauri::command]
pub fn write_mod_file_content(
    state: tauri::State<crate::State>,
    profile: String,
    mod_id: String,
    filename: String,
    content: String,
    load_order: u32,
    is_enabled: bool,
) -> Result<String, String> {
    let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
    let mods_dir = get_mods_dir_path(&inner, &profile)?;
    let file_path = mods_dir.join(&mod_id).join(&filename);

    if !file_path.exists() {
        return Err(format!("File not found: {}", file_path.display()));
    }

    // If the file is enabled, try writing to the game folder FIRST.
    // If the game has it locked, we fail before modifying staging.
    if is_enabled && load_order > 0 {
        let game_folder = get_game_folder(&inner, &profile);
        let ordered_name = make_ordered_filename(&filename, load_order);
        let game_path = game_folder.join(&ordered_name);

        if game_path.exists() {
            fs::write(&game_path, &content)
                .map_err(|e| format!(
                    "Cannot write to '{}': the file is locked by another process.\n\
                     Close the game and try again.\n{}",
                    ordered_name, e
                ))?;
        } else {
            // Try legacy naming
            let legacy_name = make_ordered_filename_legacy(&filename, load_order);
            let legacy_path = game_folder.join(&legacy_name);
            if legacy_path.exists() {
                fs::write(&legacy_path, &content)
                    .map_err(|e| format!(
                        "Cannot write to '{}': the file is locked by another process.\n\
                         Close the game and try again.\n{}",
                        legacy_name, e
                    ))?;
            }
        }
    }

    // Game folder write succeeded (or wasn't needed), now write to staging
    fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to write file: {}\n{}", file_path.display(), e))?;

    // Recompute hash
    let new_hash = sha256_file(&file_path)?;

    Ok(new_hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_ordered_filename() {
        // Resources files use prefix format: resources{order}-{rest}.s2z
        assert_eq!(make_ordered_filename("resourcesFoo.s2z", 1), "resources1-Foo.s2z");
        assert_eq!(make_ordered_filename("resourcesFoo.s2z", 10), "resources10-Foo.s2z");
        assert_eq!(make_ordered_filename("resources99.s2z", 3), "resources3-99.s2z");
        assert_eq!(make_ordered_filename("resourcesWarAxe.s2z", 5), "resources5-WarAxe.s2z");
        // Non-resources files use suffix format: name-{order}.ext
        assert_eq!(make_ordered_filename("config.xml", 3), "config-3.xml");
        assert_eq!(make_ordered_filename("WiwiUI_settings.xml", 6), "WiwiUI_settings-6.xml");
    }

    #[test]
    fn test_make_ordered_filename_legacy() {
        assert_eq!(make_ordered_filename_legacy("resourcesFoo.s2z", 1), "resourcesFoo-1.s2z");
        assert_eq!(make_ordered_filename_legacy("config.xml", 3), "config-3.xml");
    }

    #[test]
    fn test_strip_order_suffix() {
        assert_eq!(strip_order_suffix("resourcesfoo-3"), "resourcesfoo");
        assert_eq!(strip_order_suffix("resourcesfoo"), "resourcesfoo");
        assert_eq!(strip_order_suffix("resources-bar-1"), "resources-bar");
        assert_eq!(strip_order_suffix("resources-bar"), "resources-bar");
    }

    #[test]
    fn test_strip_order_prefix() {
        assert_eq!(strip_order_prefix("resources3-foo"), "resourcesfoo");
        assert_eq!(strip_order_prefix("resources10-waraxe"), "resourceswaraxe");
        assert_eq!(strip_order_prefix("resources3-99"), "resources99");
        assert_eq!(strip_order_prefix("resourcesfoo"), "resourcesfoo"); // no change
        assert_eq!(strip_order_prefix("config-3"), "config-3"); // not resources, no change
    }

    #[test]
    fn test_is_resources_file() {
        assert!(is_resources_file("resources1.s2z"));
        assert!(is_resources_file("resourcesWarAxe.s2z"));
        assert!(is_resources_file("Resources0.s2z"));
        assert!(!is_resources_file("textures.s2z"));
        assert!(!is_resources_file("resources1.zip"));
        assert!(!is_resources_file("config.xml"));
    }
}
