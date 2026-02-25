use tauri::AppHandle;
use async_trait::async_trait;
use std::collections::HashMap;
use crate::utils::CancelToken;

// pub mod yarg;
// pub mod official_setlist;
pub mod s2;

pub const PUB_KEY: &str = "";

#[derive(Clone, serde::Serialize)]
pub struct ProgressPayload {
    pub state: String,
    pub total: u64,
    pub current: u64,
}

/// A single file entry in a remote manifest.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ManifestFile {
    pub sha256: String,
    pub size: u64,
}

/// Remote manifest describing all files in a game release.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Manifest {
    pub version: String,
    pub files: HashMap<String, ManifestFile>,
}

/// Result returned by `patch_update` containing the files that were
/// successfully repaired and the ones that had to be skipped.
#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct PatchResult {
    pub repaired: Vec<String>,
    pub skipped: Vec<String>,
}

#[async_trait]
pub trait AppProfile {
    async fn download_and_install(
        &self,
        app: &AppHandle,
        zip_urls: Vec<String>,
        sig_urls: Vec<String>,
        cancel_token: &CancelToken
    ) -> Result<(), String>;

    /// Patch-update the existing installation using a remote manifest.
    /// Only downloads files that are new or changed compared to the local install.
    /// Returns a [`PatchResult`] listing repaired and skipped file paths.
    async fn patch_update(
        &self,
        app: &AppHandle,
        manifest_url: String,
        cancel_token: &CancelToken
    ) -> Result<PatchResult, String>;

    async fn install(
        &self
    ) -> Result<(), String>;

    async fn uninstall(
        &self,
        manifest_url: &str,
    ) -> Result<(), String>;

    fn exists(
        &self
    ) -> bool;

    fn is_dotnetfx_installed(&self) -> bool;

    fn is_vcredist_installed(&self) -> bool;

    fn is_directx_installed(&self) -> bool;

    fn log_message(&self, message: &str);

    fn launch(
        &self
    ) -> Result<(), String>;

    fn reveal_folder(
        &self
    ) -> Result<(), String>;

    fn get_install_path(
        &self
    ) -> Result<String, String>;

    /// Detect the installed version by inspecting the game binary.
    fn detect_installed_version(
        &self
    ) -> Result<Option<String>, String>;

    /// Check local files against the remote manifest.
    /// Returns `Ok(true)` if any files are missing or mismatched, `Ok(false)` if all OK.
    async fn verify_files(
        &self,
        app: &AppHandle,
        manifest_url: &str,
    ) -> Result<bool, String>;
}