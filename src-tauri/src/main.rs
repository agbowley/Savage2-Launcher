// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod utils;
mod app_profile;

use app_profile::AppProfile;
// use app_profile::official_setlist::OfficialSetlistProfile;
// use app_profile::yarg::YARGAppProfile;
use app_profile::s2::S2AppProfile;
use directories::BaseDirs;
use std::collections::HashMap;
use std::fs::{self, remove_file, File};
use std::path::PathBuf;
use std::sync::{RwLock, atomic::{AtomicBool, Ordering}};

static NOTIFICATIONS_ENABLED: AtomicBool = AtomicBool::new(true);
use tauri::{AppHandle, Manager, CustomMenuItem, SystemTray, SystemTrayMenu, SystemTrayMenuItem, SystemTrayEvent};
use utils::{clear_folder, CancelToken};
use window_shadows::set_shadow;

#[derive(Default, serde::Serialize, serde::Deserialize)]
pub struct Settings {
    pub download_location: String,
    pub initialized: bool,
    #[serde(default)]
    pub profile_locations: HashMap<String, String>,
    #[serde(default)]
    pub profile_versions: HashMap<String, String>,
}

pub struct InnerState {
    pub local_data_dir: PathBuf,
    pub s2_folder: PathBuf,
    pub launcher_folder: PathBuf,
    pub temp_folder: PathBuf,
    pub savage2_folder: PathBuf,
    pub cancel_token: CancelToken,

    pub settings: Settings,
}

impl InnerState {
    pub fn init(&mut self) -> Result<(), String> {
        let dirs = BaseDirs::new().ok_or("Failed to get directories.")?;

        self.local_data_dir = PathBuf::from(dirs.data_local_dir());

        self.s2_folder = PathBuf::from(dirs.data_local_dir());
        self.s2_folder.push("Savage 2");

        self.launcher_folder = PathBuf::from(&self.s2_folder);
        self.launcher_folder.push("Launcher");

        self.temp_folder = PathBuf::from(&self.launcher_folder);
        self.temp_folder.push("Temp");

        // Create launcher directory (for the settings)
        std::fs::create_dir_all(&self.launcher_folder)
            .map_err(|e| format!("Failed to create launcher directory.\n{:?}", e))?;

        // Load settings
        let settings_path = self.launcher_folder.join("settings.json");
        if settings_path.exists() {
            // Get file
            let settings_file = File::open(settings_path)
                .map_err(|e| format!("Failed to open settings.json file.\n{:?}", e))?;

            // Convert from json and save to settings
            let settings: Result<Settings, _> = serde_json::from_reader(settings_file);
            if let Ok(settings) = settings {
                self.settings = settings;
            } else {
                self.create_new_settings_file()?;
            }
        } else {
            self.create_new_settings_file()?;
        }

        // Set the rest of the folder locations based on settings
        self.set_download_locations()?;

        // Delete everything temp (just in case)
        clear_folder(&self.temp_folder)?;

        Ok(())
    }

    fn set_download_locations(&mut self) -> Result<(), String> {
        self.savage2_folder = PathBuf::from(&self.settings.download_location);
        // self.savage2_folder.push("Savage 2 - A Tortured Soul");

        // Create the directories if they don't exist
        std::fs::create_dir_all(&self.savage2_folder)
            .map_err(|e| format!("Failed to create Savage 2 directory.\n{:?}", e))?;

        Ok(())
    }

    fn create_new_settings_file(&mut self) -> Result<(), String> {
        // Create new settings
        self.settings = Default::default();
        self.settings.download_location = self
            .s2_folder
            .clone()
            .into_os_string()
            .into_string()
            .unwrap();

        // Then save
        self.save_settings_file()?;

        Ok(())
    }

    pub fn save_settings_file(&mut self) -> Result<(), String> {
        // Delete the old settings (if it exists)
        let settings_path = self.launcher_folder.join("settings.json");
        let _ = remove_file(&settings_path);

        // Create settings file
        let settings_file = File::create(settings_path)
            .map_err(|e| format!("Failed to create settings file.\n{:?}", e))?;

        // Write to file
        serde_json::to_writer(settings_file, &self.settings)
            .map_err(|e| format!("Failed to write to settings file.\n{:?}", e))?;

        Ok(())
    }
}

pub struct State(pub RwLock<InnerState>);

/// All known S2 profile keys (must match the tag_name values in the frontend release definitions).
const S2_PROFILES: &[&str] = &["latest", "beta", "legacy"];

#[tauri::command(async)]
fn init(state: tauri::State<State>) -> Result<(), String> {
    let mut state_guard = state.0.write().unwrap();
    state_guard.init()?;

    // Scan each profile for installed versions on startup.
    // This uses PE resource / binary scan — it's instant and doesn't launch the game.
    let mut changed = false;
    for &profile in S2_PROFILES {
        // Skip profiles that already have a cached version
        if let Some(v) = state_guard.settings.profile_versions.get(profile) {
            if !v.is_empty() {
                continue;
            }
        }

        // Build the profile's root folder
        let root_folder = state_guard.settings.profile_locations
            .get(profile)
            .filter(|p| !p.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| default_profile_folder(&state_guard.local_data_dir, profile));

        let app_profile = S2AppProfile {
            root_folder,
            temp_folder: state_guard.temp_folder.clone(),
        };

        // Only attempt detection if the game is actually installed
        if app_profile.exists() {
            if let Ok(Some(version)) = app_profile.detect_installed_version() {
                state_guard.settings.profile_versions.insert(profile.to_string(), version);
                changed = true;
            }
        }
    }

    if changed {
        let _ = state_guard.save_settings_file();
    }

    Ok(())
}

#[tauri::command(async)]
fn is_initialized(state: tauri::State<State>) -> Result<bool, String> {
    let state_guard = state.0.read().unwrap();
    Ok(state_guard.settings.initialized)
}

/// Returns the default install folder for a given profile.
/// e.g. %LOCALAPPDATA%/Savage 2 CE, %LOCALAPPDATA%/Savage 2 CE - Beta, etc.
fn default_profile_folder(base: &std::path::Path, profile: &str) -> PathBuf {
    let folder_name = match profile {
        "latest" => "Savage 2 CE",
        "beta" => "Savage 2 CE - Beta",
        "legacy" => "Savage 2 Legacy",
        other => other,
    };
    base.join(folder_name)
}

fn create_app_profile(
    app_name: String,
    state: &tauri::State<State>,
    profile: String
) -> Result<Box<dyn AppProfile + Send>, String> {
    let state_guard = state.0.read().unwrap();

    // Use profile-specific location if set, otherwise use the default per-profile folder
    let root_folder = state_guard.settings.profile_locations
        .get(&profile)
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| default_profile_folder(&state_guard.local_data_dir, &profile));

    Ok(match app_name.as_str() {
        "Savage 2" => Box::new(S2AppProfile {
            root_folder,
            temp_folder: state_guard.temp_folder.clone(),
        }),
        _ => Err(format!("Unknown app profile `{}`.", app_name))?
    })
}

#[tauri::command(async)]
async fn download_and_install(
    state: tauri::State<'_, State>,
    app_handle: AppHandle,
    app_name: String,
    profile: String,
    zip_urls: Vec<String>,
    sig_urls: Vec<String>
) -> Result<(), String> {
    let (app_profile, cancel_token) = {
        let state_guard = state.0.read().unwrap();
        // Reset the cancel token before starting
        state_guard.cancel_token.reset();
        let token = state_guard.cancel_token.clone();
        drop(state_guard);

        let profile = create_app_profile(
            app_name,
            &state,
            profile
        )?;
        (profile, token)
    };

    app_profile.download_and_install(
        &app_handle,
        zip_urls,
        sig_urls,
        &cancel_token
    ).await?;

    Ok(())
}

#[tauri::command(async)]
async fn patch_update(
    state: tauri::State<'_, State>,
    app_handle: AppHandle,
    app_name: String,
    profile: String,
    manifest_url: String,
) -> Result<app_profile::PatchResult, String> {
    let (app_profile, cancel_token) = {
        let state_guard = state.0.read().unwrap();
        state_guard.cancel_token.reset();
        let token = state_guard.cancel_token.clone();
        drop(state_guard);

        let profile = create_app_profile(
            app_name,
            &state,
            profile
        )?;
        (profile, token)
    };

    app_profile.patch_update(
        &app_handle,
        manifest_url,
        &cancel_token
    ).await
}

#[tauri::command(async)]
async fn verify_files(
    state: tauri::State<'_, State>,
    app_handle: AppHandle,
    app_name: String,
    profile: String,
    manifest_url: String,
) -> Result<bool, String> {
    let app_profile = create_app_profile(
        app_name,
        &state,
        profile
    )?;

    app_profile.verify_files(&app_handle, &manifest_url).await
}

#[tauri::command(async)]
async fn uninstall(
    state: tauri::State<'_, State>,
    app_name: String,
    profile: String,
    manifest_url: String,
) -> Result<(), String> {
    let app_profile = create_app_profile(
        app_name,
        &state,
        profile.clone()
    )?;

    app_profile.uninstall(&manifest_url).await?;

    // Clear the cached installed version since the game is now removed
    let mut state_guard = state.0.write().unwrap();
    state_guard.settings.profile_versions.remove(&profile);
    let _ = state_guard.save_settings_file();

    Ok(())
}

#[tauri::command(async)]
fn exists(
    state: tauri::State<State>,
    app_name: String,
    profile: String
) -> Result<bool, String> {
    let app_profile = create_app_profile(
        app_name,
        &state,
        profile
    )?;

    Ok(app_profile.exists())
}

#[tauri::command(async)]
fn launch(
    state: tauri::State<'_, State>,
    app_name: String,
    profile: String
) -> Result<(), String> {
    let app_profile = create_app_profile(
        app_name,
        &state,
        profile
    )?;

    app_profile.launch()
}

#[tauri::command(async)]
fn reveal_folder(
    state: tauri::State<'_, State>,
    app_name: String,
    profile: String
) -> Result<(), String> {
    let app_profile = create_app_profile(
        app_name,
        &state,
        profile
    )?;

    app_profile.reveal_folder()
}

#[tauri::command(async)]
fn get_installed_version(
    state: tauri::State<'_, State>,
    _app_name: String,
    profile: String
) -> Result<Option<String>, String> {
    let state_guard = state.0.read().unwrap();
    Ok(state_guard.settings.profile_versions
        .get(&profile)
        .filter(|v| !v.is_empty())
        .cloned())
}

#[tauri::command(async)]
fn get_install_path(
    state: tauri::State<'_, State>,
    app_name: String,
    profile: String
) -> Result<String, String> {
    let app_profile = create_app_profile(
        app_name,
        &state,
        profile
    )?;

    app_profile.get_install_path()
}

#[tauri::command(async)]
fn detect_installed_version(
    state: tauri::State<'_, State>,
    app_name: String,
    profile: String
) -> Result<Option<String>, String> {
    // First check if we already have a cached version in settings
    {
        let state_guard = state.0.read().unwrap();
        if let Some(v) = state_guard.settings.profile_versions.get(&profile) {
            if !v.is_empty() {
                return Ok(Some(v.clone()));
            }
        }
    }

    let app_profile = create_app_profile(
        app_name,
        &state,
        profile.clone()
    )?;

    let detected = app_profile.detect_installed_version()?;

    // Cache the detected version in settings
    if let Some(ref version) = detected {
        let mut state_guard = state.0.write().unwrap();
        state_guard.settings.profile_versions.insert(profile, version.clone());
        let _ = state_guard.save_settings_file();
    }

    Ok(detected)
}

#[tauri::command(async)]
fn save_installed_version(
    state: tauri::State<'_, State>,
    _app_name: String,
    profile: String,
    version: String
) -> Result<(), String> {
    let mut state_guard = state.0.write().unwrap();
    state_guard.settings.profile_versions.insert(profile, version);
    state_guard.save_settings_file()?;
    Ok(())
}

#[tauri::command(async)]
async fn fetch_remote_version(
    version_url: String
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(&version_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch remote version from `{}`.\n{:?}", &version_url, e))?;

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read remote version response.\n{:?}", e))?;

    Ok(text.trim().to_string())
}

/// Sends a HEAD request to the given URL and returns the Last-Modified header value.
#[tauri::command(async)]
async fn fetch_last_modified(
    url: String
) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let response = client
        .head(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to send HEAD request to `{}`.\n{:?}", &url, e))?;

    let last_modified = response
        .headers()
        .get("last-modified")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    Ok(last_modified)
}

#[tauri::command]
fn get_os() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
fn is_dir_empty(path: String) -> bool {
    match fs::read_dir(path) {
        Ok(mut entries) => entries.next().is_none(),
        Err(_) => false,
    }
}

#[tauri::command(async)]
async fn set_download_location(
    state: tauri::State<'_, State>,
    path: Option<String>,
) -> Result<(), String> {
    let mut state_guard = state.0.write().unwrap();

    // If this is None, just use the default
    if let Some(path) = path {
        state_guard.settings.download_location = path.clone();
    }

    state_guard.settings.initialized = true;

    state_guard.set_download_locations()?;
    state_guard.save_settings_file()?;

    Ok(())
}

#[tauri::command]
fn get_download_location(state: tauri::State<'_, State>) -> Result<String, String> {
    let state_guard = state.0.read().unwrap();
    Ok(state_guard.settings.download_location.clone())
}

#[tauri::command]
fn get_profile_location(state: tauri::State<'_, State>, profile: String) -> Result<String, String> {
    let state_guard = state.0.read().unwrap();
    // Return profile-specific location if set, otherwise the default per-profile folder
    if let Some(loc) = state_guard.settings.profile_locations.get(&profile) {
        if !loc.is_empty() {
            return Ok(loc.clone());
        }
    }
    let default_path = default_profile_folder(&state_guard.local_data_dir, &profile);
    Ok(default_path.to_string_lossy().to_string())
}

#[tauri::command(async)]
async fn set_profile_location(
    state: tauri::State<'_, State>,
    profile: String,
    path: String,
) -> Result<(), String> {
    let mut state_guard = state.0.write().unwrap();
    state_guard.settings.profile_locations.insert(profile, path);
    state_guard.settings.initialized = true;
    state_guard.save_settings_file()?;
    Ok(())
}

#[tauri::command]
fn cancel_task(state: tauri::State<'_, State>) -> Result<(), String> {
    let state_guard = state.0.read().unwrap();
    state_guard.cancel_token.cancel();
    Ok(())
}

#[tauri::command]
fn set_tray_notifications_label(app: AppHandle, enabled: bool) {
    NOTIFICATIONS_ENABLED.store(enabled, Ordering::SeqCst);
    let _ = app.tray_handle().get_item("notifications").set_selected(enabled);
}

#[tauri::command]
fn show_notification(app: AppHandle, title: String, body: String) {
    #[cfg(target_os = "windows")]
    {
        use tauri_winrt_notification::Toast;
        let handle = app.clone();
        // Spawn so we don't block the command handler
        std::thread::spawn(move || {
            let _ = Toast::new("net.savage2.launcher")
                .title(&title)
                .text1(&body)
                .on_activated(move |_action| {
                    if let Some(window) = handle.get_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                    Ok(())
                })
                .show();
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = tauri::api::notification::Notification::new(&app.config().tauri.bundle.identifier)
            .title(&title)
            .body(&body)
            .show();
    }
}

/// Hidden-install mode: launched as an elevated child process by `run_elevated_and_wait`.
///
/// Creates an invisible Windows desktop, runs the given installer on it (so that ALL
/// windows — including VC Redist, DirectX, and NSIS progress dialogs — are invisible to
/// the user), waits for the installer to complete, and exits with its exit code.
///
/// Usage: `<self_exe> --hidden-install "<installer_path>" "<installer_args>"`
#[cfg(target_os = "windows")]
fn hidden_install_main(installer_path: &str, installer_args: &str) -> i32 {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::mem;
    use std::ptr;

    // ── Win32 type declarations ──────────────────────────────────────

    #[repr(C)]
    #[allow(non_snake_case)]
    struct STARTUPINFOW {
        cb: u32,
        lpReserved: *mut u16,
        lpDesktop: *mut u16,
        lpTitle: *mut u16,
        dwX: u32,
        dwY: u32,
        dwXSize: u32,
        dwYSize: u32,
        dwXCountChars: u32,
        dwYCountChars: u32,
        dwFillAttribute: u32,
        dwFlags: u32,
        wShowWindow: u16,
        cbReserved2: u16,
        lpReserved2: *mut u8,
        hStdInput: isize,
        hStdOutput: isize,
        hStdError: isize,
    }

    #[repr(C)]
    #[allow(non_snake_case)]
    struct PROCESS_INFORMATION {
        hProcess: isize,
        hThread: isize,
        dwProcessId: u32,
        dwThreadId: u32,
    }

    // ── Win32 function imports ───────────────────────────────────────

    #[link(name = "user32")]
    extern "system" {
        fn CreateDesktopW(
            lpszDesktop: *const u16,
            lpszDevice: *const u16,
            pDevmode: *const u8,
            dwFlags: u32,
            dwDesiredAccess: u32,
            lpsa: *const u8,
        ) -> isize;
        fn CloseDesktop(hDesktop: isize) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateProcessW(
            lpApplicationName: *const u16,
            lpCommandLine: *mut u16,
            lpProcessAttributes: *const u8,
            lpThreadAttributes: *const u8,
            bInheritHandles: i32,
            dwCreationFlags: u32,
            lpEnvironment: *const u8,
            lpCurrentDirectory: *const u16,
            lpStartupInfo: *const STARTUPINFOW,
            lpProcessInformation: *mut PROCESS_INFORMATION,
        ) -> i32;
        fn WaitForSingleObject(hHandle: isize, dwMilliseconds: u32) -> u32;
        fn GetExitCodeProcess(hProcess: isize, lpExitCode: *mut u32) -> i32;
        fn CloseHandle(hObject: isize) -> i32;
    }

    const STARTF_USESHOWWINDOW: u32 = 0x00000001;
    const SW_HIDE: u16 = 0;
    const INFINITE: u32 = 0xFFFFFFFF;
    const GENERIC_ALL: u32 = 0x10000000;

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    unsafe {
        // Create a hidden desktop — all windows created by the installer (and its
        // child processes) will appear here instead of on the user's visible desktop.
        let desktop_name = "S2HiddenInstall";
        let desktop_name_wide = to_wide(desktop_name);

        let desktop = CreateDesktopW(
            desktop_name_wide.as_ptr(),
            ptr::null(),
            ptr::null(),
            0,
            GENERIC_ALL,
            ptr::null(),
        );

        // If desktop creation fails, fall back to running on the default desktop.
        // The installer will still work — windows just won't be hidden.
        let mut desktop_str = if desktop != 0 {
            to_wide(desktop_name)
        } else {
            to_wide("")
        };

        // Build command line: "installer_path" installer_args
        // Note: /D= in NSIS takes everything to end-of-line, so spaces in the
        // install path are handled correctly without quoting.
        let cmd_line = format!("\"{}\" {}", installer_path, installer_args);
        let mut cmd_line_wide = to_wide(&cmd_line);

        let mut si: STARTUPINFOW = mem::zeroed();
        si.cb = mem::size_of::<STARTUPINFOW>() as u32;
        si.dwFlags = STARTF_USESHOWWINDOW;
        si.wShowWindow = SW_HIDE;

        if desktop != 0 {
            si.lpDesktop = desktop_str.as_mut_ptr();
        }

        let mut pi: PROCESS_INFORMATION = mem::zeroed();

        let success = CreateProcessW(
            ptr::null(),
            cmd_line_wide.as_mut_ptr(),
            ptr::null(),
            ptr::null(),
            0,
            0,
            ptr::null(),
            ptr::null(),
            &si,
            &mut pi,
        );

        if success == 0 {
            if desktop != 0 { CloseDesktop(desktop); }
            return 1;
        }

        WaitForSingleObject(pi.hProcess, INFINITE);

        let mut exit_code: u32 = 0;
        GetExitCodeProcess(pi.hProcess, &mut exit_code);

        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        if desktop != 0 { CloseDesktop(desktop); }

        exit_code as i32
    }
}

fn main() {
    // ── Hidden-install dispatch ──────────────────────────────────────
    // When the launcher is re-launched elevated with "--hidden-install", skip
    // Tauri entirely and just run the installer on a hidden desktop.
    #[cfg(target_os = "windows")]
    {
        let args: Vec<String> = std::env::args().collect();
        if args.len() >= 4 && args[1] == "--hidden-install" {
            std::process::exit(hidden_install_main(&args[2], &args[3]));
        }
    }

    // ── Set AUMID ────────────────────────────────────────────────────
    // Tell Windows this process belongs to "Savage 2 Launcher" so that
    // toast notifications show the correct app name and icon.
    #[cfg(target_os = "windows")]
    {
        extern "system" {
            fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
        }
        let id: Vec<u16> = "net.savage2.launcher"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        unsafe { SetCurrentProcessExplicitAppUserModelID(id.as_ptr()); }
    }

    // Build the system tray menu
    let show = CustomMenuItem::new("show", "Open");
    let notifications = CustomMenuItem::new("notifications", "Notifications").selected();
    let quit = CustomMenuItem::new("quit", "Quit");
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(notifications)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);
    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Another instance was launched — focus the existing window.
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_log::Builder::default().build())
        .manage(State(RwLock::new(InnerState {
            local_data_dir: PathBuf::new(),
            s2_folder: PathBuf::new(),
            launcher_folder: PathBuf::new(),
            temp_folder: PathBuf::new(),
            savage2_folder: PathBuf::new(),
            cancel_token: CancelToken::new(),
            settings: Default::default(),
        })))
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                "notifications" => {
                    let prev = NOTIFICATIONS_ENABLED.load(Ordering::SeqCst);
                    let next = !prev;
                    NOTIFICATIONS_ENABLED.store(next, Ordering::SeqCst);

                    let _ = app.tray_handle().get_item("notifications").set_selected(next);

                    // Sync the frontend store
                    let _ = app.emit_all("notifications-toggled", next);
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                // Hide to tray instead of closing
                let _ = event.window().hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            init,
            is_initialized,

            download_and_install,
            patch_update,
            verify_files,
            uninstall,
            exists,
            launch,
            reveal_folder,
            get_installed_version,
            get_install_path,
            detect_installed_version,
            save_installed_version,
            fetch_remote_version,
            fetch_last_modified,

            get_os,
            is_dir_empty,

            set_download_location,
            get_download_location,
            get_profile_location,
            set_profile_location,
            cancel_task,
            set_tray_notifications_label,
            show_notification
        ])
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            let _ = set_shadow(&window, true);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application.");
}
