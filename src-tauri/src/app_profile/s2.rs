use async_trait::async_trait;
use minisign::{PublicKeyBox, SignatureBox};
use regex::Regex;
use sha2::{Sha256, Digest};
use tauri::Manager;
use std::collections::HashMap;
use std::{fs::{self, remove_file, File}, io::Read, path::{Path, PathBuf}, process::Command};

use crate::utils::*;
use crate::utils::CancelToken;

use super::*;

/// Run an executable with UAC elevation on a hidden desktop.
///
/// Instead of launching the target exe directly (which would let its child processes
/// show windows on the user's visible desktop), this re-launches the launcher itself
/// elevated with `--hidden-install`, which creates a hidden Windows desktop and runs
/// the target exe on it.  All child windows — VC Redist, DirectX, NSIS progress bars —
/// are invisible to the user.
#[cfg(target_os = "windows")]
fn run_elevated_and_wait(exe_path: &str, args: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::mem;

    #[repr(C)]
    #[allow(non_snake_case)]
    struct SHELLEXECUTEINFOW {
        cbSize: u32,
        fMask: u32,
        hwnd: isize,
        lpVerb: *const u16,
        lpFile: *const u16,
        lpParameters: *const u16,
        lpDirectory: *const u16,
        nShow: i32,
        hInstApp: isize,
        lpIDList: isize,
        lpClass: *const u16,
        hkeyClass: isize,
        dwHotKey: u32,
        hIcon: isize,
        hProcess: isize,
    }

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteExW(pExecInfo: *mut SHELLEXECUTEINFOW) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn WaitForSingleObject(hHandle: isize, dwMilliseconds: u32) -> u32;
        fn CloseHandle(hObject: isize) -> i32;
        fn GetExitCodeProcess(hProcess: isize, lpExitCode: *mut u32) -> i32;
    }

    const SEE_MASK_NOCLOSEPROCESS: u32 = 0x00000040;
    const SW_HIDE: i32 = 0;
    const INFINITE: u32 = 0xFFFFFFFF;

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    // Re-launch ourselves elevated with --hidden-install so the target exe
    // (and all its children) run on an invisible desktop.
    let self_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current exe path: {}", e))?;
    let self_exe_str = self_exe.to_str()
        .ok_or("Failed to convert current exe path to string")?;

    let verb = to_wide("runas");
    let file = to_wide(self_exe_str);
    let params = to_wide(&format!("--hidden-install \"{}\" \"{}\"", exe_path, args));

    unsafe {
        let mut sei: SHELLEXECUTEINFOW = mem::zeroed();
        sei.cbSize = mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        sei.fMask = SEE_MASK_NOCLOSEPROCESS;
        sei.lpVerb = verb.as_ptr();
        sei.lpFile = file.as_ptr();
        sei.lpParameters = params.as_ptr();
        sei.nShow = SW_HIDE;

        if ShellExecuteExW(&mut sei) == 0 {
            return Err(format!(
                "Failed to launch with elevation.\nPath: {}\nArgs: {}",
                exe_path, args
            ));
        }

        if sei.hProcess != 0 {
            WaitForSingleObject(sei.hProcess, INFINITE);

            let mut exit_code: u32 = 0;
            GetExitCodeProcess(sei.hProcess, &mut exit_code);
            CloseHandle(sei.hProcess);

            if exit_code != 0 {
                return Err(format!(
                    "Installer exited with error code {}.\nPath: {}\nArgs: {}",
                    exit_code, exe_path, args
                ));
            }
        }
    }

    Ok(())
}

pub struct S2AppProfile {
    pub root_folder: PathBuf,
    pub temp_folder: PathBuf,
}

impl S2AppProfile {
    /// Returns the game folder (root_folder is the game folder directly).
    fn get_folder(&self) -> PathBuf {
        self.root_folder.clone()
    }

    /// Returns the platform-specific executable name.
    fn exec_name() -> Result<&'static str, String> {
        match std::env::consts::OS {
            "windows" => Ok("savage2.exe"),
            "linux" => Ok("savage2"),
            "macos" => Ok("savage2.app"),
            _ => Err("Unknown platform!".into()),
        }
    }

    /// Find the actual game executable by checking multiple candidate locations.
    /// Priority: 1) directly in root_folder (the game folder),
    ///           2) root_folder/Savage 2 - A Tortured Soul (legacy/NSIS installs)
    fn find_exec(&self) -> Result<PathBuf, String> {
        let exec_name = Self::exec_name()?;

        let candidates = [
            self.root_folder.clone(),
            self.root_folder.join("Savage 2 - A Tortured Soul"),
        ];

        for dir in &candidates {
            let exec_path = if std::env::consts::OS == "macos" {
                dir.join("savage2.app").join("Contents").join("MacOS").join("Savage2")
            } else if std::env::consts::OS == "linux" {
                // Check for both possible Linux binary names
                let p = dir.join("savage2");
                if p.exists() {
                    p
                } else {
                    let p2 = dir.join("savage2.x86_64");
                    if p2.exists() {
                        p2
                    } else {
                        dir.join("savage2")
                    }
                }
            } else {
                dir.join(exec_name)
            };

            if exec_path.exists() {
                return Ok(exec_path);
            }
        }

        // Return the standard path even though it doesn't exist (for error messages)
        Ok(self.get_folder().join(exec_name))
    }

    /// Find the actual game folder (the directory containing the executable).
    fn find_game_folder(&self) -> PathBuf {
        if let Ok(exec) = self.find_exec() {
            if exec.exists() {
                if let Some(parent) = exec.parent() {
                    if std::env::consts::OS == "macos" {
                        if let Some(app_parent) = parent.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
                            return app_parent.to_path_buf();
                        }
                    }
                    return parent.to_path_buf();
                }
            }
        }
        self.get_folder()
    }

    fn get_exec(&self) -> Result<PathBuf, String> {
        self.find_exec()
    }

    /// Get the path to the game's console.log file.
    /// Windows: Documents/Savage 2 - A Tortured Soul CE/game/console.log
    /// Linux: ~/.savage2/game/console.log
    fn get_console_log_path() -> Result<PathBuf, String> {
        match std::env::consts::OS {
            "windows" => {
                let docs = directories::UserDirs::new()
                    .and_then(|u| u.document_dir().map(|d| d.to_path_buf()))
                    .ok_or("Failed to find Documents directory")?;
                Ok(docs.join("Savage 2 - A Tortured Soul CE").join("game").join("console.log"))
            }
            "linux" => {
                let home = directories::BaseDirs::new()
                    .ok_or("Failed to find home directory")?;
                Ok(home.home_dir().join(".savage2").join("game").join("console.log"))
            }
            "macos" => {
                let home = directories::BaseDirs::new()
                    .ok_or("Failed to find home directory")?;
                Ok(home.home_dir().join(".savage2").join("game").join("console.log"))
            }
            _ => Err("Unsupported platform".into()),
        }
    }

    /// Parse a version string (e.g. "2.2.2.0") from text content.
    /// Looks for the bracketed version pattern: [2.2.2.0]
    fn parse_version_from_console_log(content: &str) -> Option<String> {
        let re = Regex::new(r"\[(\d+\.\d+\.\d+\.\d+)\]").ok()?;
        for line in content.lines().take(20) {
            if let Some(caps) = re.captures(line) {
                return Some(caps[1].to_string());
            }
        }
        None
    }

    /// Read the FileVersion from the PE version resource of an executable (Windows only).
    /// Uses the GetFileVersionInfoW / VerQueryValueW Windows APIs.
    #[cfg(target_os = "windows")]
    fn read_pe_version(exe_path: &Path) -> Option<String> {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use std::mem;

        #[link(name = "version")]
        extern "system" {
            fn GetFileVersionInfoSizeW(lptstrFilename: *const u16, lpdwHandle: *mut u32) -> u32;
            fn GetFileVersionInfoW(
                lptstrFilename: *const u16, dwHandle: u32,
                dwLen: u32, lpData: *mut u8,
            ) -> i32;
            fn VerQueryValueW(
                pBlock: *const u8, lpSubBlock: *const u16,
                lplpBuffer: *mut *const u8, puLen: *mut u32,
            ) -> i32;
        }

        #[repr(C)]
        #[allow(non_snake_case)]
        struct VS_FIXEDFILEINFO {
            dwSignature: u32,
            dwStrucVersion: u32,
            dwFileVersionMS: u32,
            dwFileVersionLS: u32,
            dwProductVersionMS: u32,
            dwProductVersionLS: u32,
            dwFileFlagsMask: u32,
            dwFileFlags: u32,
            dwFileOS: u32,
            dwFileType: u32,
            dwFileSubtype: u32,
            dwFileDateMS: u32,
            dwFileDateLS: u32,
        }

        fn to_wide(s: &str) -> Vec<u16> {
            OsStr::new(s).encode_wide().chain(Some(0)).collect()
        }

        let path_wide = to_wide(&exe_path.to_string_lossy());

        unsafe {
            let mut handle: u32 = 0;
            let size = GetFileVersionInfoSizeW(path_wide.as_ptr(), &mut handle);
            if size == 0 {
                return None;
            }

            let mut buffer = vec![0u8; size as usize];
            if GetFileVersionInfoW(path_wide.as_ptr(), handle, size, buffer.as_mut_ptr()) == 0 {
                return None;
            }

            let sub_block = to_wide("\\");
            let mut info_ptr: *const u8 = std::ptr::null();
            let mut info_len: u32 = 0;

            if VerQueryValueW(buffer.as_ptr(), sub_block.as_ptr(), &mut info_ptr, &mut info_len) == 0 {
                return None;
            }

            if info_len < mem::size_of::<VS_FIXEDFILEINFO>() as u32 {
                return None;
            }

            let info = &*(info_ptr as *const VS_FIXEDFILEINFO);

            // Validate the signature (0xFEEF04BD)
            if info.dwSignature != 0xFEEF04BD {
                return None;
            }

            let major = (info.dwFileVersionMS >> 16) & 0xFFFF;
            let minor = info.dwFileVersionMS & 0xFFFF;
            let patch = (info.dwFileVersionLS >> 16) & 0xFFFF;
            let build = info.dwFileVersionLS & 0xFFFF;

            Some(format!("{}.{}.{}.{}", major, minor, patch, build))
        }
    }

    /// Scan the first portion of the game binary for a version string.
    /// Looks for the pattern X.X.X.X near known context like build date markers.
    fn scan_binary_for_version(exe_path: &Path) -> Option<String> {
        let mut file = File::open(exe_path).ok()?;

        // Read up to 8 MB of the binary — the version string is typically in the
        // early portion embedded as a string literal by the compiler.
        let max_read = 8 * 1024 * 1024;
        let file_size = file.metadata().ok()?.len() as usize;
        let read_size = file_size.min(max_read);

        let mut buffer = vec![0u8; read_size];
        file.read_exact(&mut buffer).ok()?;

        // Convert to string lossy for regex scanning.
        // We look for a version pattern near recognizable context strings.
        let content = String::from_utf8_lossy(&buffer);

        // Look for the version pattern near a date-like context that the S2 engine emits,
        // e.g. "[Feb 18 2026][14:30:00][2.2.2.0]" or just "2.2.2.0" near "Savage"
        let re = Regex::new(r"\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b").ok()?;

        // Collect all matches and prefer ones that look like game versions (not IPs like 127.0.0.1)
        let mut best: Option<String> = None;
        for caps in re.captures_iter(&content) {
            let version = caps[1].to_string();
            let parts: Vec<u32> = version.split('.').filter_map(|p| p.parse().ok()).collect();
            if parts.len() != 4 { continue; }

            // Skip obvious non-versions: 0.0.0.0, 127.0.0.1, 255.255.255.255, etc.
            if parts[0] == 0 || parts[0] == 127 || parts[0] == 255 { continue; }
            if parts.iter().all(|&p| p == 0) { continue; }

            // Prefer versions where the first component is small (1-9) — game version, not IP
            if parts[0] <= 9 {
                best = Some(version);
                // Don't break — the last match in the binary is often the best
                // (string literals come after header data)
            }
        }

        best
    }

    /// Try to read the version from an existing console.log without launching the game.
    fn read_version_from_console_log() -> Option<String> {
        let console_log_path = Self::get_console_log_path().ok()?;
        if !console_log_path.exists() {
            return None;
        }
        let content = fs::read_to_string(&console_log_path).ok()?;
        Self::parse_version_from_console_log(&content)
    }

    /// Run an NSIS installer silently with /S flag and install to the game folder.
    /// Uses the Windows ShellExecuteEx API directly for UAC elevation.
    async fn run_nsis_installer(&self, app: &tauri::AppHandle, installer_path: &Path) -> Result<(), String> {
        let install_dir = self.get_folder();
        let installer_str = installer_path.to_str().ok_or("Invalid installer path")?;
        let install_dir_str = install_dir.to_str().ok_or("Invalid install directory path")?;

        let _ = app.emit_all(
            "progress_info",
            ProgressPayload {
                state: "installing".to_string(),
                current: 0,
                total: 0,
            },
        );

        // NSIS silent install: /S for silent, /D= to set install directory
        // /D= must be the last parameter and must NOT be wrapped in quotes
        let args = format!("/S /D={}", install_dir_str);

        #[cfg(target_os = "windows")]
        run_elevated_and_wait(installer_str, &args)?;

        #[cfg(not(target_os = "windows"))]
        return Err("NSIS installers are only supported on Windows.".into());

        Ok(())
    }

    /// Launch the legacy installer with UAC elevation on the **visible** desktop
    /// so the user can interact with it manually.  Unlike `run_nsis_installer` this
    /// does NOT use the hidden-desktop approach and passes no silent flags.
    ///
    /// The legacy installer always shows a Start Menu error dialog that causes a
    /// non-zero exit code, so we ignore exit codes and instead verify the game was
    /// installed by checking for the executable afterwards.
    #[cfg(target_os = "windows")]
    async fn run_legacy_installer(&self, app: &tauri::AppHandle, installer_path: &Path) -> Result<(), String> {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use std::mem;

        #[repr(C)]
        #[allow(non_snake_case)]
        struct SHELLEXECUTEINFOW {
            cbSize: u32,
            fMask: u32,
            hwnd: isize,
            lpVerb: *const u16,
            lpFile: *const u16,
            lpParameters: *const u16,
            lpDirectory: *const u16,
            nShow: i32,
            hInstApp: isize,
            lpIDList: isize,
            lpClass: *const u16,
            hkeyClass: isize,
            dwHotKey: u32,
            hIcon: isize,
            hProcess: isize,
        }

        #[link(name = "shell32")]
        extern "system" {
            fn ShellExecuteExW(pExecInfo: *mut SHELLEXECUTEINFOW) -> i32;
        }

        #[link(name = "kernel32")]
        extern "system" {
            fn WaitForSingleObject(hHandle: isize, dwMilliseconds: u32) -> u32;
            fn CloseHandle(hObject: isize) -> i32;
        }

        const SEE_MASK_NOCLOSEPROCESS: u32 = 0x00000040;
        const SW_SHOWNORMAL: i32 = 1;
        const INFINITE: u32 = 0xFFFFFFFF;

        fn to_wide(s: &str) -> Vec<u16> {
            OsStr::new(s).encode_wide().chain(Some(0)).collect()
        }

        let installer_str = installer_path.to_str().ok_or("Invalid installer path")?;

        let _ = app.emit_all(
            "progress_info",
            ProgressPayload {
                state: "installing".to_string(),
                current: 0,
                total: 0,
            },
        );

        let verb = to_wide("runas");
        let file = to_wide(installer_str);

        unsafe {
            let mut sei: SHELLEXECUTEINFOW = mem::zeroed();
            sei.cbSize = mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            sei.fMask = SEE_MASK_NOCLOSEPROCESS;
            sei.lpVerb = verb.as_ptr();
            sei.lpFile = file.as_ptr();
            sei.nShow = SW_SHOWNORMAL;

            if ShellExecuteExW(&mut sei) == 0 {
                return Err(format!(
                    "Failed to launch the legacy installer with elevation.\nPath: {}",
                    installer_str
                ));
            }

            if sei.hProcess != 0 {
                WaitForSingleObject(sei.hProcess, INFINITE);
                // We intentionally ignore the exit code — the legacy installer
                // always shows a Start Menu error dialog that causes a non-zero
                // exit, but the game files are installed correctly.
                CloseHandle(sei.hProcess);
            }
        }

        // Verify the game was actually installed by looking for the executable.
        let exec = Self::exec_name()?;
        let game_folder = self.get_folder();
        let exec_path = game_folder.join(exec);
        if !exec_path.exists() {
            return Err(
                "The installer finished but the game executable was not found.\n\
                The install may have been cancelled or installed to a different location."
                    .to_string(),
            );
        }

        Ok(())
    }

    async fn run_installer_with_elevation(&self, installer_path: &Path) -> Result<(), String> {
        let installer_str = installer_path.to_str().ok_or("Invalid path")?;

        #[cfg(target_os = "windows")]
        run_elevated_and_wait(installer_str, "/silent")?;

        #[cfg(not(target_os = "windows"))]
        {
            let status = Command::new(installer_path)
                .arg("/silent")
                .status()
                .map_err(|e| format!("Failed to start installer: {}", e))?;

            if !status.success() {
                return Err("Failed to execute installer.".into());
            }
        }

        Ok(())
    }

    // ── Patch-update helpers ──────────────────────────────────────────

    /// Compute the SHA-256 hash of a single file and return it as a lowercase hex string.
    fn sha256_file(path: &Path) -> Result<String, String> {
        let mut file = File::open(path)
            .map_err(|e| format!("Failed to open `{}` for hashing.\n{:?}", path.display(), e))?;
        let mut hasher = Sha256::new();
        let mut buf = [0u8; 64 * 1024];
        loop {
            let n = file.read(&mut buf)
                .map_err(|e| format!("Error reading `{}` for hashing.\n{:?}", path.display(), e))?;
            if n == 0 { break; }
            hasher.update(&buf[..n]);
        }
        Ok(format!("{:x}", hasher.finalize()))
    }

    /// Recursively walk a directory and compute SHA-256 for every file.
    /// Keys in the map are forward-slash relative paths (e.g. "game/resources0.s2z").
    fn hash_directory(
        dir: &Path,
        root: &Path,
        out: &mut HashMap<String, String>,
    ) -> Result<(), String> {
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("Failed to read directory `{}`.\n{:?}", dir.display(), e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Error reading dir entry.\n{:?}", e))?;
            let path = entry.path();
            if path.is_dir() {
                Self::hash_directory(&path, root, out)?;
            } else {
                let rel = path.strip_prefix(root)
                    .map_err(|_| format!("Path `{}` is not under root `{}`", path.display(), root.display()))?;
                let key = rel.to_string_lossy().replace('\\', "/");
                // Skip the manifest and generator scripts — they live alongside
                // the game files but must not be tracked/patched.
                if matches!(key.as_str(), "manifest.json" | "generate_manifest.py" | "generate-manifest.bat") {
                    continue;
                }
                let hash = Self::sha256_file(&path)?;
                out.insert(key, hash);
            }
        }
        Ok(())
    }

    /// Download a single file via streaming with cumulative progress reporting.
    async fn download_file_with_progress(
        app: &tauri::AppHandle,
        client: &reqwest::Client,
        url: &str,
        output_path: &Path,
        already_downloaded: u64,
        total_size: u64,
        cancel_token: &CancelToken,
    ) -> Result<(), String> {
        use futures_util::StreamExt;

        let resp = client.get(url).send().await
            .map_err(|e| format!("Failed to download `{}`.\n{:?}", url, e))?;

        if !resp.status().is_success() {
            let code = resp.status().as_u16();
            if (400..500).contains(&code) {
                // 4xx = file not found / not accessible on the server
                return Err(format!("FILE_UNAVAILABLE:{}:{}", code, url));
            }
            return Err(format!(
                "Download failed with HTTP {} for `{}`.",
                code, url
            ));
        }

        let mut file = File::create(output_path)
            .map_err(|e| format!("Failed to create `{}`.\n{:?}", output_path.display(), e))?;

        let mut stream = resp.bytes_stream();
        let mut file_downloaded: u64 = 0;

        while let Some(chunk) = stream.next().await {
            if cancel_token.is_cancelled() {
                drop(file);
                let _ = std::fs::remove_file(output_path);
                return Err("CANCELLED".into());
            }

            let bytes = chunk.map_err(|e| format!("Streaming error.\n{:?}", e))?;
            use std::io::Write;
            file.write_all(&bytes)
                .map_err(|e| format!("Write error.\n{:?}", e))?;

            file_downloaded += bytes.len() as u64;

            let _ = app.emit_all("progress_info", ProgressPayload {
                state: "downloading".to_string(),
                current: (already_downloaded + file_downloaded).min(total_size),
                total: total_size,
            });
        }

        Ok(())
    }

    /// Remove empty directories recursively (bottom-up).
    fn remove_empty_dirs(dir: &Path) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    Self::remove_empty_dirs(&path);
                    // Try to remove — will only succeed if empty
                    let _ = fs::remove_dir(&path);
                }
            }
        }
    }

    /// Try to load a manifest: fetch from the remote URL first, then fall back
    /// to a local `manifest.json` in the game folder.  Returns `None` only if
    /// both sources are unavailable or unparseable.
    async fn fetch_or_load_manifest(manifest_url: &str, game_folder: &Path) -> Option<Manifest> {
        // Try remote first
        let client = reqwest::Client::new();
        if let Ok(resp) = client.get(manifest_url).send().await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    if let Ok(manifest) = serde_json::from_str::<Manifest>(&text) {
                        return Some(manifest);
                    }
                }
            }
        }

        // Fall back to local manifest.json (saved by patch_update)
        let local_path = game_folder.join("manifest.json");
        if local_path.exists() {
            if let Ok(text) = std::fs::read_to_string(&local_path) {
                if let Ok(manifest) = serde_json::from_str::<Manifest>(&text) {
                    eprintln!("[manifest] Using local manifest.json as fallback.");
                    return Some(manifest);
                }
            }
        }

        None
    }
}

#[async_trait]
impl AppProfile for S2AppProfile {
    async fn download_and_install(
        &self,
        app: &tauri::AppHandle,
        zip_urls: Vec<String>,
        sig_urls: Vec<String>,
        cancel_token: &CancelToken
    ) -> Result<(), String> {
        let zip_url = zip_urls.first().ok_or("Did not get any download URLs.")?;
        let sig_url = sig_urls.first();

        // Clean up old game files while preserving user mods.
        // Try to use a local manifest to only remove tracked files.
        // Falls back to remove_dir_all only if no manifest is available.
        let game_folder = self.get_folder();
        if game_folder.exists() {
            let local_manifest_path = game_folder.join("manifest.json");
            if local_manifest_path.exists() {
                if let Ok(text) = std::fs::read_to_string(&local_manifest_path) {
                    if let Ok(manifest) = serde_json::from_str::<Manifest>(&text) {
                        // Remove only manifest-tracked files
                        for (rel_path, _) in &manifest.files {
                            let full_path = game_folder.join(rel_path);
                            if full_path.exists() {
                                let _ = std::fs::remove_file(&full_path);
                            }
                        }
                        let _ = std::fs::remove_file(&local_manifest_path);
                        Self::remove_empty_dirs(&game_folder);
                    } else {
                        // Manifest corrupt — fall back to full removal
                        std::fs::remove_dir_all(&game_folder)
                            .map_err(|e| format!("Failed to remove old game files.\n{:?}", e))?;
                    }
                } else {
                    std::fs::remove_dir_all(&game_folder)
                        .map_err(|e| format!("Failed to remove old game files.\n{:?}", e))?;
                }
            } else {
                // No manifest present — install on top of existing files to
                // preserve user mods and other non-tracked content.
            }
        }

        // Ensure the game folder exists
        std::fs::create_dir_all(&game_folder)
            .map_err(|e| format!("Failed to create game directory.\n{:?}", e))?;

        let is_exe_installer = zip_url.ends_with(".exe");
        // The CE installer (Savage2CEInstall.exe) is NSIS and supports silent
        // install.  The legacy installer is a different format that requires
        // user interaction (and always shows a Start Menu error dialog).
        let is_legacy_installer = is_exe_installer
            && !zip_url.to_lowercase().contains("savage2ceinstall");

        if is_exe_installer {
            // === EXE Installer Flow (Windows) ===
            // Ensure temp directory exists before downloading
            std::fs::create_dir_all(&self.temp_folder)
                .map_err(|e| format!("Failed to create temp directory.\n{:?}", e))?;

            // Derive the filename from the URL so the temp name matches
            let installer_filename = zip_url
                .rsplit('/')
                .next()
                .unwrap_or("installer.exe");
            let installer_path = &self.temp_folder.join(installer_filename);
            download(Some(app), &zip_url, &installer_path, Some(cancel_token)).await?;

            // Verify the installer file actually exists after download
            // (Windows Defender can quarantine .exe files immediately)
            if !installer_path.exists() {
                return Err(format!(
                    "Installer was downloaded but the file no longer exists at:\n{}\n\
                    This is likely caused by Windows Defender or antivirus software quarantining the file. \
                    Try adding an exclusion for the Savage 2 Launcher folder.",
                    installer_path.display()
                ));
            }

            // Verify the file is a valid PE executable (starts with "MZ")
            {
                let mut header = [0u8; 2];
                let mut f = File::open(&installer_path)
                    .map_err(|e| format!("Failed to open downloaded installer for validation.\n{:?}", e))?;
                use std::io::Read;
                f.read_exact(&mut header)
                    .map_err(|_| format!(
                        "Downloaded installer is too small to be a valid executable ({}). \
                        The file may not exist on the remote server.",
                        installer_path.display()
                    ))?;
                if header != [0x4D, 0x5A] { // "MZ" magic bytes
                    let file_size = installer_path.metadata()
                        .map(|m| m.len())
                        .unwrap_or(0);
                    return Err(format!(
                        "Downloaded file is not a valid Windows executable (size: {} bytes, header: {:02X} {:02X}).\n\
                        The server may have returned an error page instead of the installer.\n\
                        URL: {}",
                        file_size, header[0], header[1], zip_url
                    ));
                }
            }

            if is_legacy_installer {
                // Legacy installer — launch on the visible desktop so the user
                // can interact with it.  Exit code is ignored; we verify the
                // executable exists afterwards inside run_legacy_installer.
                #[cfg(target_os = "windows")]
                self.run_legacy_installer(app, installer_path).await?;

                #[cfg(not(target_os = "windows"))]
                return Err("EXE installers are only supported on Windows.".into());
            } else {
                // CE (NSIS) installer — silent install on a hidden desktop.
                let install_dir = self.get_folder();
                std::fs::create_dir_all(&install_dir)
                    .map_err(|e| format!("Failed to create install directory.\n{:?}", e))?;

                self.run_nsis_installer(app, installer_path).await?;
            }

            // Clean up installer
            let _ = remove_file(installer_path);
        } else {
            // === Zip/Tar.gz Flow (Linux/macOS) ===
            let folder = self.get_folder();

            // Preserve the original file extension so extract() picks the right method
            let archive_ext = if zip_url.ends_with(".tar.gz") || zip_url.ends_with(".tgz") {
                "tar.gz"
            } else {
                "zip"
            };
            let archive_name = format!("update.{}", archive_ext);
            let zip_path = &self.temp_folder.join(archive_name);
            download(Some(app), &zip_url, &zip_path, Some(cancel_token)).await?;

            // Verify (if signature is provided)
            if let Some(sig_url) = sig_url {
                let _ = app.emit_all(
                    "progress_info",
                    ProgressPayload {
                        state: "verifying".to_string(),
                        current: 0,
                        total: 0,
                    },
                );

                let sig_path = &self.temp_folder.join("update.sig");
                download(None, &sig_url, &sig_path, None).await?;

                let pk_box = PublicKeyBox::from_string(PUB_KEY).unwrap();
                let pk = pk_box.into_public_key().unwrap();

                let sig_box = SignatureBox::from_file(sig_path)
                    .map_err(|e| format!("Invalid signature file! Try reinstalling.\n{:?}", e))?;

                let zip_file = File::open(zip_path)
                    .map_err(|e| format!("Failed to open archive while verifying.\n{:?}", e))?;
                minisign::verify(&pk, &sig_box, zip_file, true, false, false)
                    .map_err(|_| "Failed to verify downloaded file! Try reinstalling.")?;
            }

            let _ = app.emit_all(
                "progress_info",
                ProgressPayload {
                    state: "installing".to_string(),
                    current: 0,
                    total: 0,
                },
            );

            extract(&zip_path, &folder)?;

            let _ = remove_file(&zip_path);

            self.install().await?;
        }

        Ok(())
    }

    fn log_message(&self, message: &str) {
        println!("{}", message);
    }

    async fn patch_update(
        &self,
        app: &tauri::AppHandle,
        manifest_url: String,
        cancel_token: &CancelToken
    ) -> Result<(), String> {
        let game_folder = self.find_game_folder();
        if !game_folder.exists() {
            return Err("Game is not installed. Use a full install instead.".into());
        }

        // --- 1. Fetch the remote manifest ---
        let _ = app.emit_all("progress_info", ProgressPayload {
            state: "checking".to_string(),
            current: 0,
            total: 0,
        });

        let client = reqwest::Client::new();
        let resp = client.get(&manifest_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch manifest from `{}`.\n{:?}", &manifest_url, e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "Manifest download failed with HTTP {} for `{}`.",
                resp.status().as_u16(), manifest_url
            ));
        }

        let manifest_text = resp.text().await
            .map_err(|e| format!("Failed to read manifest response.\n{:?}", e))?;

        let manifest: Manifest = serde_json::from_str(&manifest_text)
            .map_err(|e| format!("Failed to parse manifest JSON.\n{:?}", e))?;

        if cancel_token.is_cancelled() {
            return Err("CANCELLED".into());
        }

        // --- 2. Check only manifest files and build a diff ---
        let _ = app.emit_all("progress_info", ProgressPayload {
            state: "checking".to_string(),
            current: 0,
            total: manifest.files.len() as u64,
        });

        // Determine which files need to be downloaded (new or changed)
        // Only hash files listed in the manifest — skip user mods/extras
        let mut to_download: Vec<(String, u64)> = Vec::new();
        let mut total_download_size: u64 = 0;

        for (rel_path, manifest_entry) in &manifest.files {
            let full_path = game_folder.join(rel_path);
            let needs_download = if full_path.exists() {
                let local_hash = Self::sha256_file(&full_path)?;
                local_hash != manifest_entry.sha256
            } else {
                true
            };
            if needs_download {
                to_download.push((rel_path.clone(), manifest_entry.size));
                total_download_size += manifest_entry.size;
            }
        }

        // If nothing needs downloading, we're already up to date
        if to_download.is_empty() {
            return Ok(());
        }

        // --- 3. Download changed / new files ---
        // Derive the base URL for individual files from the manifest URL.
        // e.g. ".../latest/manifest.json" → ".../latest/files/"
        let base_url = manifest_url
            .rsplit_once('/')
            .map(|(base, _)| format!("{}/files/", base))
            .ok_or("Invalid manifest URL — cannot derive file base URL.")?;

        let mut downloaded: u64 = 0;

        // Ensure temp folder exists
        std::fs::create_dir_all(&self.temp_folder)
            .map_err(|e| format!("Failed to create temp directory.\n{:?}", e))?;

        let mut skipped: Vec<String> = Vec::new();

        for (rel_path, file_size) in &to_download {
            if cancel_token.is_cancelled() {
                return Err("CANCELLED".into());
            }

            let file_url = format!("{}{}", base_url, rel_path.replace('\\', "/"));
            let target_path = game_folder.join(rel_path);

            // Create parent directories
            if let Some(parent) = target_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directory `{}`.\n{:?}", parent.display(), e))?;
            }

            // Download to a temp file first, then move into place
            let temp_file = self.temp_folder.join(format!("patch_{}", rel_path.replace(['/', '\\'], "_")));

            // Download with streaming progress — skip gracefully if the file
            // is listed in the manifest but missing/inaccessible on the server.
            let download_result = Self::download_file_with_progress(
                app,
                &client,
                &file_url,
                &temp_file,
                downloaded,
                total_download_size,
                cancel_token,
            ).await;

            match download_result {
                Ok(()) => {}
                Err(e) if e == "CANCELLED" => return Err(e),
                Err(e) if e.starts_with("FILE_UNAVAILABLE:") => {
                    eprintln!("[patch_update] Skipping `{}` — file not available on server ({})",
                        rel_path, e);
                    skipped.push(rel_path.clone());
                    downloaded += file_size;
                    continue;
                }
                Err(e) => return Err(e),
            }

            // Verify the hash of the downloaded file
            let actual_hash = Self::sha256_file(&temp_file)?;
            let expected_hash = &manifest.files[rel_path].sha256;
            if &actual_hash != expected_hash {
                let _ = std::fs::remove_file(&temp_file);
                // Hash mismatch — the server copy may be stale/corrupt.
                // Skip rather than aborting the entire update.
                eprintln!(
                    "[patch_update] Hash mismatch for `{}` (expected {}, got {}). Skipping.",
                    rel_path, expected_hash, actual_hash
                );
                skipped.push(rel_path.clone());
                downloaded += file_size;
                continue;
            }

            // Move the verified file into place
            // Remove existing file first (in case it's read-only, etc.)
            if target_path.exists() {
                let _ = std::fs::remove_file(&target_path);
            }
            std::fs::rename(&temp_file, &target_path)
                .or_else(|_| {
                    // rename can fail across filesystems — fall back to copy + delete
                    std::fs::copy(&temp_file, &target_path)
                        .map_err(|e| format!("Failed to copy `{}` into place.\n{:?}", rel_path, e))?;
                    let _ = std::fs::remove_file(&temp_file);
                    Ok::<(), String>(())
                })?;

            downloaded += file_size;
        }

        if !skipped.is_empty() {
            eprintln!(
                "[patch_update] Completed with {} file(s) skipped: {}",
                skipped.len(),
                skipped.join(", ")
            );
        }

        // Save the manifest locally so uninstall can use it as a fallback
        let manifest_path = game_folder.join("manifest.json");
        let _ = std::fs::write(&manifest_path, &manifest_text);

        Ok(())
    }

    async fn verify_files(
        &self,
        app: &tauri::AppHandle,
        manifest_url: &str,
    ) -> Result<bool, String> {
        let game_folder = self.find_game_folder();
        if !game_folder.exists() {
            return Err("Game is not installed.".into());
        }

        // Emit a checking state so the UI can show a spinner
        let _ = app.emit_all("progress_info", ProgressPayload {
            state: "verifying".to_string(),
            current: 0,
            total: 0,
        });

        let client = reqwest::Client::new();
        let resp = client.get(manifest_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch manifest.\n{:?}", e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "Manifest download failed with HTTP {}.",
                resp.status().as_u16()
            ));
        }

        let manifest_text = resp.text().await
            .map_err(|e| format!("Failed to read manifest response.\n{:?}", e))?;

        let manifest: Manifest = serde_json::from_str(&manifest_text)
            .map_err(|e| format!("Failed to parse manifest JSON.\n{:?}", e))?;

        // Quick check: only look for missing files (no hashing).
        // This keeps the play-button response near-instant.
        for (rel_path, _) in &manifest.files {
            let full_path = game_folder.join(rel_path);
            if !full_path.exists() {
                return Ok(true); // file missing — needs repair
            }
        }

        Ok(false)
    }

    fn is_directx_installed(&self) -> bool {
        #[cfg(target_os = "windows")]
        {
            let system32_path = Path::new("C:\\Windows\\System32\\d3dx9_43.dll");
            return system32_path.exists();
        }
        #[cfg(not(target_os = "windows"))]
        {
            return false;
        }
    }

    fn is_vcredist_installed(&self) -> bool {
        #[cfg(target_os = "windows")]
        {
            let registry_key_path_x86 = r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x86";
            let registry_key_path_x64 = r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64";

            let output_x86 = Command::new("reg")
                .args(&["query", registry_key_path_x86])
                .output()
                .expect("Failed to check VC++ Redistributable (x86)");

            let output_x64 = Command::new("reg")
                .args(&["query", registry_key_path_x64])
                .output()
                .expect("Failed to check VC++ Redistributable (x64)");

            return output_x86.status.success() || output_x64.status.success();
        }
        #[cfg(not(target_os = "windows"))]
        {
            return false;
        }
    }

    fn is_dotnetfx_installed(&self) -> bool {
        #[cfg(target_os = "windows")]
        {
            let registry_key_path = r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full";
            let output = Command::new("reg")
                .args(&["query", registry_key_path])
                .output()
                .expect("Failed to check .NET Framework");

            return output.status.success();
        }
        #[cfg(not(target_os = "windows"))]
        {
            return false;
        }
    }

    async fn install(&self) -> Result<(), String> {
        self.log_message("Starting installation...");

        let install_folder = self.get_folder();

        self.log_message("Install folder: ");
        self.log_message(&install_folder.display().to_string());

        #[cfg(target_os = "windows")]
        {
            let directx_installer = install_folder.join("directxredist/DXSETUP.exe");
            let vcredist_installer = install_folder.join("vcredist_x86.exe");
            let dotnetfx_installer = install_folder.join("dotnetfx.exe");

            if !self.is_directx_installed() {
                self.log_message("DirectX not installed. Installing...");
                match self.run_installer_with_elevation(&directx_installer).await {
                    Ok(_) => self.log_message("DirectX installation successful."),
                    Err(e) => self.log_message(&format!("DirectX installation failed: {}", e)),
                }
            } else {
                self.log_message("DirectX already installed. Skipping installation.");
            }

            if !self.is_vcredist_installed() {
                self.log_message("VC++ Redistributable not installed. Installing...");
                match self.run_installer_with_elevation(&vcredist_installer).await {
                    Ok(_) => self.log_message("VC++ Redistributable installation successful."),
                    Err(e) => self.log_message(&format!("VC++ Redistributable installation failed: {}", e)),
                }
            } else {
                self.log_message("VC++ Redistributable already installed. Skipping installation.");
            }

            if !self.is_dotnetfx_installed() {
                self.log_message(".NET Framework not installed. Installing...");
                match self.run_installer_with_elevation(&dotnetfx_installer).await {
                    Ok(_) => self.log_message(".NET Framework installation successful."),
                    Err(e) => self.log_message(&format!(".NET Framework installation failed: {}", e)),
                }
            } else {
                self.log_message(".NET Framework already installed. Skipping installation.");
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            self.log_message("Non-Windows platform — skipping runtime dependency installation.");
        }

        Ok(())
    }

    async fn uninstall(&self, manifest_url: &str) -> Result<(), String> {
        let game_folder = self.find_game_folder();
        if !game_folder.exists() {
            return Err("Game is not installed.".into());
        }

        // Try to get the manifest: remote first, then local fallback.
        // If neither is available, fall back to removing the entire game folder.
        let manifest = Self::fetch_or_load_manifest(manifest_url, &game_folder).await;

        match manifest {
            Some(manifest) => {
                // Delete only files listed in the manifest (preserves mods)
                for (rel_path, _) in &manifest.files {
                    let full_path = game_folder.join(rel_path);
                    if full_path.exists() {
                        let _ = std::fs::remove_file(&full_path);
                    }
                }

                // Also remove the manifest file itself if present
                let manifest_path = game_folder.join("manifest.json");
                if manifest_path.exists() {
                    let _ = std::fs::remove_file(&manifest_path);
                }

                // Clean up empty directories left behind
                Self::remove_empty_dirs(&game_folder);

                // Remove the game folder itself if it's now empty
                let _ = std::fs::remove_dir(&game_folder);
            }
            None => {
                // No manifest available — remove the entire game folder as a last resort
                eprintln!("[uninstall] Could not fetch or load manifest. Removing entire game folder.");
                std::fs::remove_dir_all(&game_folder)
                    .map_err(|e| format!("Failed to remove game folder.\n{:?}", e))?;
            }
        }

        // Remove the root/profile folder if empty
        let _ = std::fs::remove_dir(&self.root_folder);

        Ok(())
    }

    fn exists(&self) -> bool {
        match self.get_exec() {
            Ok(exec_path) => exec_path.exists(),
            Err(_) => false,
        }
    }

    fn launch(&self) -> Result<(), String> {
        let game_path = self.get_exec()?;
        let game_folder = self.find_game_folder();

        self.log_message(&format!("Launching game from: {}", game_path.display()));

        let result = Command::new(&game_path)
            .current_dir(&game_folder)
            .spawn();

        match result {
            Ok(_) => Ok(()),
            #[cfg(target_os = "windows")]
            Err(ref e) if e.raw_os_error() == Some(740) => {
                // ERROR_ELEVATION_REQUIRED (740) — the legacy game executable
                // has an embedded manifest that demands admin privileges.
                // Re-launch it with ShellExecuteEx "runas" so the user gets
                // a UAC prompt instead of an error.
                self.log_message("Game requires elevation, re-launching with runas...");

                use std::ffi::OsStr;
                use std::os::windows::ffi::OsStrExt;
                use std::mem;

                #[repr(C)]
                #[allow(non_snake_case)]
                struct SHELLEXECUTEINFOW {
                    cbSize: u32,
                    fMask: u32,
                    hwnd: isize,
                    lpVerb: *const u16,
                    lpFile: *const u16,
                    lpParameters: *const u16,
                    lpDirectory: *const u16,
                    nShow: i32,
                    hInstApp: isize,
                    lpIDList: isize,
                    lpClass: *const u16,
                    hkeyClass: isize,
                    dwHotKey: u32,
                    hIcon: isize,
                    hProcess: isize,
                }

                #[link(name = "shell32")]
                extern "system" {
                    fn ShellExecuteExW(pExecInfo: *mut SHELLEXECUTEINFOW) -> i32;
                }

                const SW_SHOWNORMAL: i32 = 1;

                fn to_wide(s: &str) -> Vec<u16> {
                    OsStr::new(s).encode_wide().chain(Some(0)).collect()
                }

                let verb = to_wide("runas");
                let file = to_wide(game_path.to_str().ok_or("Invalid game path")?);
                let dir = to_wide(game_folder.to_str().ok_or("Invalid game folder path")?);

                unsafe {
                    let mut sei: SHELLEXECUTEINFOW = mem::zeroed();
                    sei.cbSize = mem::size_of::<SHELLEXECUTEINFOW>() as u32;
                    sei.lpVerb = verb.as_ptr();
                    sei.lpFile = file.as_ptr();
                    sei.lpDirectory = dir.as_ptr();
                    sei.nShow = SW_SHOWNORMAL;

                    if ShellExecuteExW(&mut sei) == 0 {
                        return Err("Failed to launch the game with elevation.".to_string());
                    }
                }

                Ok(())
            }
            Err(e) => Err(format!("Failed to launch game: {:?}", e)),
        }
    }

    fn reveal_folder(&self) -> Result<(), String> {
        let folder = self.find_game_folder();
        if !folder.exists() {
            return Err("The install folder no longer exists on disk.".to_string());
        }

        // opener::reveal may fail on Linux-like environments detected as WSL
        // (tries explorer.exe which doesn't exist). Fall back to opening the folder directly.
        if let Err(_e) = opener::reveal(&folder) {
            opener::open(&folder)
                .map_err(|e| format!("Failed to open folder.\n{:?}", e))?;
        }

        Ok(())
    }

    fn get_install_path(&self) -> Result<String, String> {
        let folder = self.find_game_folder();
        folder.to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "Failed to convert install path to string.".to_string())
    }

    fn detect_installed_version(&self) -> Result<Option<String>, String> {
        // If the game isn't installed, nothing to detect
        if !self.exists() {
            return Ok(None);
        }

        let game_path = self.get_exec()?;

        // === Strategy 1: PE version resource (Windows) ===
        // Instant, invisible, reads embedded version info from the exe header.
        #[cfg(target_os = "windows")]
        {
            self.log_message("Trying PE version resource...");
            if let Some(version) = Self::read_pe_version(&game_path) {
                // Skip 0.0.0.0 which means "no version set"
                if version != "0.0.0.0" {
                    self.log_message(&format!("Detected version from PE resource: {}", version));
                    return Ok(Some(version));
                }
            }
            self.log_message("PE version resource not available or empty.");
        }

        // === Strategy 2: Binary string scan ===
        // Scan the executable for embedded version strings.
        self.log_message("Trying binary scan...");
        if let Some(version) = Self::scan_binary_for_version(&game_path) {
            self.log_message(&format!("Detected version from binary scan: {}", version));
            return Ok(Some(version));
        }
        self.log_message("Binary scan did not find a version.");

        // === Strategy 3: Existing console.log ===
        // Check if a previous game session left a console.log with version info.
        // Does NOT launch the game.
        self.log_message("Trying existing console.log...");
        if let Some(version) = Self::read_version_from_console_log() {
            self.log_message(&format!("Detected version from console.log: {}", version));
            return Ok(Some(version));
        }
        self.log_message("No version found in console.log.");

        self.log_message("Could not detect installed version by any method.");
        Ok(None)
    }
}