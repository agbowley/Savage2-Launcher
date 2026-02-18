use async_trait::async_trait;
use minisign::{PublicKeyBox, SignatureBox};
use tauri::Manager;
use std::{env, fs::{self, remove_file, File}, path::{Path, PathBuf}, process::Command};

use crate::utils::*;

use super::*;

pub struct S2AppProfile {
    pub root_folder: PathBuf,
    pub temp_folder: PathBuf,
    pub version: String,
    pub profile: String
}

impl S2AppProfile {
    fn get_folder(
        &self
    ) -> PathBuf {
        self.root_folder.join(&self.profile).join(&self.version).join("Savage 2 - A Tortured Soul")
    }

    fn get_exec(
        &self
    ) -> Result<PathBuf, String> {
        let mut path = self.get_folder();

        // Each OS has a different executable
        path = match std::env::consts::OS.to_string().as_str() {
            "windows" => path.join("savage2.exe"),
            "linux" => {
                let mut p = path.join("savage2.x86_64");
                if !p.exists() {
                    p = path.join("Savage 2 - A Tortured Soul");
                }
                p
            }
            "macos" => path
                .join("savage2.app")
                .join("Contents")
                .join("MacOS")
                .join("Savage2"),
            _ => Err("Unknown platform for launch!")?,
        };

        Ok(path)
    }

    /// Path to the version marker file for this profile
    fn get_version_file_path(&self) -> PathBuf {
        self.root_folder.join(&self.profile).join("installed_version.txt")
    }

    /// Run an NSIS installer silently with /S flag and install to the game folder.
    /// The NSIS /D= flag sets the install directory (must be last argument, no quotes).
    async fn run_nsis_installer(&self, app: &tauri::AppHandle, installer_path: &Path) -> Result<(), String> {
        let install_dir = self.get_folder();
        let installer_str = installer_path.to_str().ok_or("Invalid installer path")?;
        let install_dir_str = install_dir.to_str().ok_or("Invalid install directory path")?;

        // Emit installing state
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
        let script = format!(
            "Start-Process -FilePath '{}' -ArgumentList '/S /D={}' -Verb runAs -Wait",
            installer_str, install_dir_str
        );

        let status = Command::new("powershell")
            .args(&["-Command", &script])
            .status()
            .map_err(|e| format!("Failed to start NSIS installer: {}", e))?;

        if !status.success() {
            return Err("NSIS installer failed or was cancelled by the user.".into());
        }

        Ok(())
    }

    async fn run_installer_with_elevation(&self, installer_path: &Path) -> Result<(), String> {
        let installer_str = installer_path.to_str().ok_or("Invalid path")?;
    
        let script = format!(
            "Start-Process -FilePath '{}' -ArgumentList '/silent' -Verb runAs",
            installer_str
        );

        let status = Command::new("powershell")
            .args(&["-Command", &script])
            .status()
            .map_err(|e| format!("Failed to start process with elevation: {}", e))?;

        if !status.success() {
            return Err("Failed to execute installer with elevation".into());
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
        sig_urls: Vec<String>
    ) -> Result<(), String> {
        let mut folder = self.root_folder.join(&self.profile);

        let zip_url = zip_urls.first().ok_or("Did not get any download URLs.")?;
        let sig_url = sig_urls.first();

        // Delete the old installation
        clear_folder(&folder)?;

        // Move into the version's folder
        folder = folder.join(&self.version);

        // Check if this is an .exe installer (NSIS) or a zip/tar.gz
        let is_nsis_installer = zip_url.ends_with(".exe");

        if is_nsis_installer {
            // === NSIS Installer Flow (Windows) ===
            // Download the NSIS installer to temp
            let installer_path = &self.temp_folder.join("Savage2CEInstall.exe");
            download(Some(app), &zip_url, &installer_path).await?;

            // Create the target directory for NSIS /D= flag
            let install_dir = self.get_folder();
            std::fs::create_dir_all(&install_dir)
                .map_err(|e| format!("Failed to create install directory.\n{:?}", e))?;

            // Run NSIS installer silently
            self.run_nsis_installer(app, installer_path).await?;

            // Clean up installer
            let _ = remove_file(installer_path);

            // Save the installed version
            self.save_installed_version(&self.version)?;
        } else {
            // === Zip/Tar.gz Flow (Linux/macOS) ===
            // Keep original game folder structure - /Savage 2 - A Tortured Soul/
            folder = folder.join("Savage 2 - A Tortured Soul");

            // Download the archive
            let zip_path = &self.temp_folder.join("update.zip");
            download(Some(app), &zip_url, &zip_path).await?;

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
                download(None, &sig_url, &sig_path).await?;

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

            // Save the installed version
            self.save_installed_version(&self.version)?;

            self.install().await?;
        }

        Ok(())
    }

    fn log_message(&self, message: &str) {
        println!("{}", message);
    }

    fn is_directx_installed(&self) -> bool {
        // This is a heuristic check, since there's no direct registry key for DirectX as a whole
        let system32_path = Path::new("C:\\Windows\\System32\\d3dx9_43.dll");
        system32_path.exists()
    }

    fn is_vcredist_installed(&self) -> bool {
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

        output_x86.status.success() || output_x64.status.success()
    }

    fn is_dotnetfx_installed(&self) -> bool {
        let registry_key_path = r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full";
        let output = Command::new("reg")
            .args(&["query", registry_key_path])
            .output()
            .expect("Failed to check .NET Framework");

        output.status.success()
    }


    async fn install(&self) -> Result<(), String> {
        self.log_message("Starting installation...");

        let install_folder = self.get_folder();

        self.log_message("Install folder: ");
        self.log_message(&install_folder.display().to_string());

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

        Ok(())
    }

    fn uninstall(
        &self
    ) -> Result<(), String> {
        let folder = self.root_folder.join(&self.profile);
        std::fs::remove_dir_all(folder)
            .map_err(|e| format!("Failed to remove directory.\n{:?}", e))
    }

    fn exists(
        &self
    ) -> bool {
        Path::new(&self.get_folder()).exists()
    }

    fn launch(
        &self
    ) -> Result<(), String> {
        let current_dir = env::current_dir().map_err(|e| format!("Failed to get current directory: {:?}", e))?;
        let helper_path = current_dir.join("helper_executable").join("src").join("helper_executable.exe");
        let game_path = self.get_exec()?;
        
        self.log_message(&format!("Launching game from: {}", game_path.display()));

        // Attempt to launch the helper executable with the game path as an argument
        let status = Command::new(helper_path)
            .arg(game_path.display().to_string())
            .status()
            .map_err(|e| format!("Failed to start helper executable: {:?}", e))?;

        if !status.success() {
            return Err("Helper executable failed to launch the game.".into());
        }

        Ok(())
    }

    fn reveal_folder(
        &self
    ) -> Result<(), String> {
        if !self.exists() {
            return Err("Cannot reveal something that doesn't exist!".to_string());
        }

        opener::reveal(self.get_folder())
            .map_err(|e| format!("Failed to reveal folder. Is it installed?\n{:?}", e))?;

        Ok(())
    }

    fn get_installed_version(
        &self
    ) -> Result<Option<String>, String> {
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

    fn save_installed_version(
        &self,
        version: &str
    ) -> Result<(), String> {
        let version_file = self.get_version_file_path();

        // Ensure parent directory exists
        if let Some(parent) = version_file.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create version file directory.\n{:?}", e))?;
        }

        fs::write(&version_file, version)
            .map_err(|e| format!("Failed to write version file.\n{:?}", e))?;

        Ok(())
    }

    fn get_install_path(
        &self
    ) -> Result<String, String> {
        let folder = self.get_folder();
        folder.to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "Failed to convert install path to string.".to_string())
    }
}