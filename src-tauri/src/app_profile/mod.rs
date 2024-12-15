use std::path::Path;

use tauri::AppHandle;
use async_trait::async_trait;

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

#[async_trait]
pub trait AppProfile {
    async fn download_and_install(
        &self,
        app: &AppHandle,
        zip_urls: Vec<String>,
        sig_urls: Vec<String>
    ) -> Result<(), String>;

    async fn install(
        &self
    ) -> Result<(), String>;

    fn uninstall(
        &self
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
}