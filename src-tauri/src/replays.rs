use directories::{BaseDirs, UserDirs};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::app_profile::ProgressPayload;
use crate::utils::{download, enrich_io_error};

const REPLAY_PENDING_HTTP_STATUS: u16 = 500;
const REPLAY_PENDING_RETRY_SECONDS: u64 = 20;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalReplayStatus {
    pub match_id: i32,
    pub exists: bool,
    pub filename: Option<String>,
    pub path: Option<String>,
    pub size: Option<u64>,
}

fn get_replay_dir_path() -> Result<PathBuf, String> {
    match std::env::consts::OS {
        "windows" => {
            let docs = UserDirs::new()
                .and_then(|u| u.document_dir().map(|d| d.to_path_buf()))
                .ok_or("Failed to find Documents directory")?;
            Ok(docs.join("Savage 2 - A Tortured Soul CE").join("game").join("replays"))
        }
        "linux" | "macos" => {
            let home = BaseDirs::new()
                .ok_or("Failed to find home directory")?;
            Ok(home.home_dir().join(".savage2").join("game").join("replays"))
        }
        _ => Err("Unsupported platform".into()),
    }
}

fn ensure_replay_dir_path() -> Result<PathBuf, String> {
    let dir = get_replay_dir_path()?;
    fs::create_dir_all(&dir)
        .map_err(|e| enrich_io_error("Failed to create replay directory.", &e))?;
    Ok(dir)
}

fn extract_match_id_from_name(name: &str) -> Option<i32> {
    let digits: String = name.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

fn is_replay_file(path: &Path) -> bool {
    path.is_file()
        && path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("s2r"))
            .unwrap_or(false)
}

fn find_replay_entry_by_match_id(dir: &Path, match_id: i32) -> Option<PathBuf> {
    let path = dir.join(format!("{}.s2r", match_id));
    if is_replay_file(&path) {
        Some(path)
    } else {
        None
    }
}

pub fn resolve_replay_file(filename: &str) -> Result<PathBuf, String> {
    let replay_dir = get_replay_dir_path()?;
    let safe_name = Path::new(filename)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Invalid replay filename")?;
    let replay_path = replay_dir.join(safe_name);

    if replay_path.exists() && is_replay_file(&replay_path) {
        Ok(replay_path)
    } else {
        Err(format!("Replay file not found: {}", safe_name))
    }
}

pub fn resolve_replay_launch_path(filename: &str) -> Result<String, String> {
    let replay_path = resolve_replay_file(filename)?;
    let replay_name = replay_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .ok_or("Invalid replay filename")?;
    let match_id = extract_match_id_from_name(replay_name)
        .ok_or("Replay filename must begin with a match ID")?;

    Ok(format!("~/replays/{}.s2r", match_id))
}

#[tauri::command]
pub fn delete_local_replay(filename: String) -> Result<(), String> {
    let replay_path = resolve_replay_file(&filename)?;
    fs::remove_file(&replay_path).map_err(|e| {
        enrich_io_error(
            &format!("Failed to delete replay file `{}`.", replay_path.display()),
            &e,
        )
    })
}

fn is_pending_download_error(error: &str) -> bool {
    error.contains(&format!("HTTP status {}", REPLAY_PENDING_HTTP_STATUS))
}

async fn replay_download_is_ready(url: &str) -> Result<bool, String> {
    let response = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to check replay availability for `{}`.\n{:?}", url, e))?;

    let status = response.status();
    if status.is_success() {
        Ok(true)
    } else if status.as_u16() == REPLAY_PENDING_HTTP_STATUS {
        Ok(false)
    } else {
        Err(format!(
            "Replay availability check failed with HTTP status {} for `{}`.",
            status.as_u16(),
            url
        ))
    }
}

fn emit_pending_payload(app: &AppHandle) {
    let _ = app.emit_all(
        "progress_info",
        ProgressPayload {
            state: "pending".to_string(),
            current: 0,
            total: 0,
        },
    );
}

async fn wait_for_retry_window(cancel_token: &crate::utils::CancelToken) -> Result<(), String> {
    for _ in 0..REPLAY_PENDING_RETRY_SECONDS {
        if cancel_token.is_cancelled() {
            return Err("CANCELLED".into());
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }

    Ok(())
}

async fn wait_for_replay_download(
    app: &AppHandle,
    url: &str,
    cancel_token: &crate::utils::CancelToken,
) -> Result<(), String> {
    loop {
        if cancel_token.is_cancelled() {
            return Err("CANCELLED".into());
        }

        if replay_download_is_ready(url).await? {
            return Ok(());
        }

        emit_pending_payload(app);
        wait_for_retry_window(cancel_token).await?;
    }
}

#[tauri::command]
pub fn get_local_replay_status(match_ids: Vec<i32>) -> Result<Vec<LocalReplayStatus>, String> {
    let replay_dir = get_replay_dir_path()?;

    if !replay_dir.exists() {
        return Ok(match_ids.into_iter().map(|match_id| LocalReplayStatus {
            match_id,
            exists: false,
            filename: None,
            path: None,
            size: None,
        }).collect());
    }

    let mut statuses = Vec::with_capacity(match_ids.len());
    for match_id in match_ids {
        if let Some(path) = find_replay_entry_by_match_id(&replay_dir, match_id) {
            let metadata = fs::metadata(&path).ok();
            statuses.push(LocalReplayStatus {
                match_id,
                exists: true,
                filename: path.file_name().and_then(|name| name.to_str()).map(|s| s.to_string()),
                path: Some(path.to_string_lossy().to_string()),
                size: metadata.map(|m| m.len()),
            });
        } else {
            statuses.push(LocalReplayStatus {
                match_id,
                exists: false,
                filename: None,
                path: None,
                size: None,
            });
        }
    }

    Ok(statuses)
}

#[tauri::command(async)]
pub async fn download_replay_file(
    app: AppHandle,
    state: tauri::State<'_, crate::State>,
    match_id: i32,
) -> Result<String, String> {
    let (dest_path, cancel_token, url) = {
        let inner = state.0.read().map_err(|e| format!("Lock error: {}", e))?;
        inner.cancel_token.reset();
        let replay_dir = ensure_replay_dir_path()?;
        let dest_path = replay_dir.join(format!("{}.s2r", match_id));
        let url = format!("https://savage2.net/api/replays/{}", match_id);
        (dest_path, inner.cancel_token.clone(), url)
    };

    loop {
        wait_for_replay_download(&app, &url, &cancel_token).await?;

        match download(Some(&app), &url, &dest_path, Some(&cancel_token)).await {
            Ok(()) => break,
            Err(error) if is_pending_download_error(&error) => {
                emit_pending_payload(&app);
                wait_for_retry_window(&cancel_token).await?;
            }
            Err(error) => return Err(error),
        }
    }

    Ok(dest_path.to_string_lossy().to_string())
}