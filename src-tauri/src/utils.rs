use futures_util::StreamExt;
use reqwest;
use sevenz_rust::Password;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::{fs::File, io::Write};
use tauri::{AppHandle, Manager};

use crate::app_profile::ProgressPayload;

const LETTERS: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/// A shared cancel token that can be checked during long-running operations.
#[derive(Clone)]
pub struct CancelToken(pub Arc<AtomicBool>);

impl CancelToken {
    pub fn new() -> Self {
        CancelToken(Arc::new(AtomicBool::new(false)))
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }

    pub fn reset(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

pub fn clear_folder(path: &Path) -> Result<(), String> {
    std::fs::remove_dir_all(path).ok();
    std::fs::create_dir_all(path).map_err(|e| {
        format!(
            "Failed to re-create folder `{}`.\n{:?}",
            path.to_string_lossy(),
            e
        )
    })?;

    Ok(())
}

pub async fn download(
    app: Option<&AppHandle>,
    url: &str,
    output_path: &Path,
    cancel_token: Option<&CancelToken>,
) -> Result<(), String> {
    // Create the downloading client
    let client = reqwest::Client::new();

    // Send the initial request
    let download = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to initialize download from `{}`.\n{:?}", &url, e))?;

    // Check for HTTP errors (404, 500, etc.)
    let status = download.status();
    if !status.is_success() {
        return Err(format!(
            "Download failed with HTTP status {} for `{}`.",
            status.as_u16(), url
        ));
    }

    let total_size = download.content_length().unwrap_or(0);

    // Create the file to download into
    let mut file = File::create(output_path).map_err(|e| {
        format!(
            "Failed to create file `{}`.\n{:?}",
            &output_path.display(),
            e
        )
    })?;
    let mut current_downloaded: u64 = 0;
    let mut stream = download.bytes_stream();

    // Download into the file
    while let Some(item) = stream.next().await {
        // Check for cancellation
        if let Some(token) = cancel_token {
            if token.is_cancelled() {
                drop(file);
                let _ = std::fs::remove_file(output_path);
                return Err("CANCELLED".into());
            }
        }

        let chunk = item.map_err(|e| format!("Error while downloading file.\n{:?}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Error while writing to file.\n{:?}", e))?;

        // Cap the downloaded at the total size
        current_downloaded += chunk.len() as u64;

        if current_downloaded > total_size {
            current_downloaded = total_size;
        }

        // Emit the download progress
        if let Some(app) = app {
            let _ = app.emit_all(
                "progress_info",
                ProgressPayload {
                    state: "downloading".to_string(),
                    current: current_downloaded,
                    total: total_size,
                },
            );
        }
    }

    // Flush to ensure all bytes are written to disk
    file.flush()
        .map_err(|e| format!("Failed to flush downloaded file.\n{:?}", e))?;

    // Verify that we actually downloaded something
    if current_downloaded == 0 {
        return Err(format!(
            "Downloaded 0 bytes from `{}`. The file may not exist on the server.",
            url
        ));
    }

    Ok(())
}

pub fn extract(from: &Path, to: &Path) -> Result<(), String> {
    clear_folder(to)?;

    let from_str = from.to_string_lossy().to_lowercase();

    if from_str.ends_with(".tar.gz") || from_str.ends_with(".tgz") {
        // tar.gz extraction
        let file = File::open(from).map_err(|e| format!("Error while opening file.\n{:?}", e))?;
        let decompressed = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(decompressed);
        archive.unpack(to)
            .map_err(|e| format!("Error while extracting tar.gz.\n{:?}", e))?;
    } else {
        // zip extraction
        let file = File::open(from).map_err(|e| format!("Error while opening file.\n{:?}", e))?;
        zip_extract::extract(file, to, false)
            .map_err(|e| format!("Error while extracting zip.\n{:?}", e))?;
    }

    // Set execute permissions on Linux/macOS binaries
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // Walk the extracted directory and make common game executables executable
        if let Ok(entries) = std::fs::read_dir(to) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");
                // Mark known game executables and .sh scripts as executable
                if name == "savage2.x86_64" || name == "savage2" || name.ends_with(".sh") {
                    if let Ok(metadata) = std::fs::metadata(&path) {
                        let mut perms = metadata.permissions();
                        perms.set_mode(perms.mode() | 0o755);
                        let _ = std::fs::set_permissions(&path, perms);
                    }
                }
            }
        }
    }

    Ok(())
}

pub fn extract_setlist_part(zip: &Path, output_path: &Path) -> Result<(), String> {
    // Idiot prevention
    let mut chars = Vec::new();
    for i in 0i32..64 {
        let a = 5u8.wrapping_add(i.wrapping_mul(104729) as u8);
        let b = 9u8.wrapping_add(i.wrapping_mul(224737) as u8);
        let c = a.wrapping_rem(b).wrapping_rem(52);
        chars.push(
            LETTERS
                .bytes()
                .nth(c as usize)
                .ok_or("Failed to index LETTERS.")? as u16,
        );
    }

    let p: &[u16] = &chars;
    sevenz_rust::decompress_file_with_password(zip, output_path, Password::from(p)).map_err(
        |e| {
            format!(
                "Failed to extract setlist part `{}`.\n{:?}",
                zip.display(),
                e
            )
        },
    )?;

    Ok(())
}
