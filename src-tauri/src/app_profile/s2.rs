use async_trait::async_trait;
use minisign::{PublicKeyBox, SignatureBox};
use regex::Regex;
use tauri::Manager;
use std::{fs::{self, remove_file, File}, path::{Path, PathBuf}, process::Command};

use crate::utils::*;
use crate::utils::CancelToken;

use super::*;

/// Run an executable with UAC elevation ("Run as administrator") and wait for it to finish.
/// Uses the Windows ShellExecuteExW API directly, bypassing PowerShell entirely.
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

    let verb = to_wide("runas");
    let file = to_wide(exe_path);
    let params = to_wide(args);

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
    pub profile: String
}

impl S2AppProfile {
    /// Returns the game folder: root/profile/Savage 2 - A Tortured Soul
    fn get_folder(&self) -> PathBuf {
        self.root_folder.join(&self.profile).join("Savage 2 - A Tortured Soul")
    }

    /// Returns the platform-specific executable name.
    fn exec_name() -> Result<&'static str, String> {
        match std::env::consts::OS {
            "windows" => Ok("savage2.exe"),
            "linux" => Ok("savage2.x86_64"),
            "macos" => Ok("savage2.app"),
            _ => Err("Unknown platform!".into()),
        }
    }

    /// Find the actual game executable by checking multiple candidate locations.
    /// Priority: 1) standard path (root/profile/Savage 2 - A Tortured Soul),
    ///           2) directly in root_folder (user picked game folder directly),
    ///           3) root_folder/Savage 2 - A Tortured Soul (user picked parent)
    fn find_exec(&self) -> Result<PathBuf, String> {
        let exec_name = Self::exec_name()?;

        let candidates = [
            self.get_folder(),
            self.root_folder.clone(),
            self.root_folder.join("Savage 2 - A Tortured Soul"),
        ];

        for dir in &candidates {
            let exec_path = if std::env::consts::OS == "macos" {
                dir.join("savage2.app").join("Contents").join("MacOS").join("Savage2")
            } else if std::env::consts::OS == "linux" {
                let p = dir.join("savage2.x86_64");
                if p.exists() {
                    p
                } else {
                    dir.join("Savage 2 - A Tortured Soul")
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

    /// Path to the version marker file for this profile
    fn get_version_file_path(&self) -> PathBuf {
        self.root_folder.join(&self.profile).join("installed_version.txt")
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

    /// Parse the version string from console.log content.
    /// Looks for a line like: [Feb 18 2026][14:30:00][2.2.2.0]
    fn parse_version_from_console_log(content: &str) -> Option<String> {
        let re = Regex::new(r"\[(\d+\.\d+\.\d+\.\d+)\]").ok()?;
        // Check only the first few lines for performance
        for line in content.lines().take(20) {
            if let Some(caps) = re.captures(line) {
                return Some(caps[1].to_string());
            }
        }
        None
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
        let profile_folder = self.root_folder.join(&self.profile);

        let zip_url = zip_urls.first().ok_or("Did not get any download URLs.")?;
        let sig_url = sig_urls.first();

        // Delete old game files but preserve installed_version.txt
        let game_folder = self.get_folder();
        if game_folder.exists() {
            std::fs::remove_dir_all(&game_folder)
                .map_err(|e| format!("Failed to remove old game files.\n{:?}", e))?;
        }

        // Ensure the profile folder exists
        std::fs::create_dir_all(&profile_folder)
            .map_err(|e| format!("Failed to create profile directory.\n{:?}", e))?;

        let is_nsis_installer = zip_url.ends_with(".exe");

        if is_nsis_installer {
            // === NSIS Installer Flow (Windows) ===
            // Ensure temp directory exists before downloading
            std::fs::create_dir_all(&self.temp_folder)
                .map_err(|e| format!("Failed to create temp directory.\n{:?}", e))?;

            let installer_path = &self.temp_folder.join("Savage2CEInstall.exe");
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

            // Create the target directory for NSIS /D= flag
            let install_dir = self.get_folder();
            std::fs::create_dir_all(&install_dir)
                .map_err(|e| format!("Failed to create install directory.\n{:?}", e))?;

            // Run NSIS installer silently
            self.run_nsis_installer(app, installer_path).await?;

            // Clean up installer
            let _ = remove_file(installer_path);
        } else {
            // === Zip/Tar.gz Flow (Linux/macOS) ===
            let folder = self.get_folder();

            let zip_path = &self.temp_folder.join("update.zip");
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

    fn uninstall(&self) -> Result<(), String> {
        let folder = self.root_folder.join(&self.profile);
        std::fs::remove_dir_all(folder)
            .map_err(|e| format!("Failed to remove directory.\n{:?}", e))
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

        Command::new(&game_path)
            .current_dir(&game_folder)
            .spawn()
            .map_err(|e| format!("Failed to launch game: {:?}", e))?;

        Ok(())
    }

    fn reveal_folder(&self) -> Result<(), String> {
        if !self.exists() {
            return Err("Cannot reveal something that doesn't exist!".to_string());
        }

        opener::reveal(self.find_game_folder())
            .map_err(|e| format!("Failed to reveal folder. Is it installed?\n{:?}", e))?;

        Ok(())
    }

    fn get_installed_version(&self) -> Result<Option<String>, String> {
        let version_file = self.get_version_file_path();
        if !version_file.exists() {
            return Ok(None);
        }

        let contents = fs::read_to_string(&version_file)
            .map_err(|e| format!("Failed to read version file.\n{:?}", e))?;
        let version = contents.trim().to_string();

        if version.is_empty() {
            Ok(None)
        } else {
            Ok(Some(version))
        }
    }

    fn save_installed_version(&self, version: &str) -> Result<(), String> {
        let version_file = self.get_version_file_path();

        if let Some(parent) = version_file.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create version file directory.\n{:?}", e))?;
        }

        fs::write(&version_file, version)
            .map_err(|e| format!("Failed to write version file.\n{:?}", e))?;

        Ok(())
    }

    fn get_install_path(&self) -> Result<String, String> {
        let folder = self.find_game_folder();
        folder.to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "Failed to convert install path to string.".to_string())
    }

    fn detect_installed_version(&self) -> Result<Option<String>, String> {
        // First check if we already have a cached version
        if let Ok(Some(cached)) = self.get_installed_version() {
            return Ok(Some(cached));
        }

        // If the game isn't installed, nothing to detect
        if !self.exists() {
            return Ok(None);
        }

        let game_path = self.get_exec()?;
        let game_folder = self.find_game_folder();

        self.log_message(&format!("Detecting version by running: {} quit", game_path.display()));

        // Run the game with "quit" argument to make it write console.log and exit
        let status = Command::new(&game_path)
            .arg("quit")
            .current_dir(&game_folder)
            .status()
            .map_err(|e| format!("Failed to run game for version detection: {}", e))?;

        // The game may return non-zero when quitting immediately, that's OK
        self.log_message(&format!("Game exited with status: {:?}", status.code()));

        // Read and parse console.log
        let console_log_path = Self::get_console_log_path()?;
        if !console_log_path.exists() {
            self.log_message(&format!("console.log not found at: {}", console_log_path.display()));
            return Ok(None);
        }

        let content = fs::read_to_string(&console_log_path)
            .map_err(|e| format!("Failed to read console.log: {}", e))?;

        if let Some(version) = Self::parse_version_from_console_log(&content) {
            self.log_message(&format!("Detected version: {}", version));
            // Cache the detected version
            self.save_installed_version(&version)?;
            Ok(Some(version))
        } else {
            self.log_message("Could not parse version from console.log");
            Ok(None)
        }
    }
}