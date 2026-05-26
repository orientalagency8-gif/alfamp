use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::menu::{Menu, MenuItem};
use tokio::sync::Mutex;

mod gta;
mod client;

#[derive(Clone, Serialize)]
pub struct ProgressPayload {
    pub stage: String,
    pub received: u64,
    pub total: u64,
    pub message: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct ClientState {
    pub installed: bool,
    pub client_path: Option<String>,
    pub install_dir: String,
    pub version: Option<String>,
    pub gta_path: Option<String>,
}

pub struct AppStateInner {
    pub downloading: bool,
    pub game_child_pid: Option<u32>,
}
pub type AppState = Arc<Mutex<AppStateInner>>;

#[tauri::command]
fn gta_detect() -> Option<String> {
    gta::detect_gta_path()
}

#[tauri::command]
fn client_state() -> ClientState {
    let install_dir = client::install_dir();
    let client_path = install_dir.join("AlfaMP.exe");
    let version = std::fs::read_to_string(install_dir.join("version.txt"))
        .ok()
        .map(|s| s.trim().to_string());

    let real_size_ok = std::fs::metadata(&client_path)
        .map(|m| m.len() >= 2 * 1024 * 1024)
        .unwrap_or(false);
    // Versions considered STALE (force re-install):
    //   - anything with "stub" / "placeholder" (test builds)
    //   - "client-v0.1.x" — pre-rebrand, still shows "FiveM" in UpdaterUI
    //   - "0.1.0-stub" etc.
    let fresh_version = version
        .as_deref()
        .map(|v| {
            let lc = v.to_lowercase();
            if lc.contains("stub") || lc.contains("placeholder") { return false; }
            if lc.starts_with("client-v0.1") || lc.starts_with("0.1.") { return false; }
            true
        })
        .unwrap_or(false);
    let installed = client_path.exists() && real_size_ok && fresh_version;

    let gta_path = gta::detect_gta_path();
    ClientState {
        installed,
        client_path: if installed { Some(client_path.to_string_lossy().into_owned()) } else { None },
        install_dir: install_dir.to_string_lossy().into_owned(),
        version,
        gta_path,
    }
}

#[tauri::command]
fn wipe_client() -> Result<(), String> {
    let dir = client::install_dir();
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("wipe failed: {}", e))?;
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("recreate failed: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn download_client(app: AppHandle, state: tauri::State<'_, AppState>, url: String) -> Result<(), String> {
    {
        let mut s = state.lock().await;
        if s.downloading { return Err("already downloading".into()); }
        s.downloading = true;
    }
    let result = client::download_and_install(app.clone(), url).await;
    {
        let mut s = state.lock().await;
        s.downloading = false;
    }
    match &result {
        Ok(()) => { let _ = app.emit("client:progress", ProgressPayload {
            stage: "done".into(), received: 0, total: 0, message: None }); }
        Err(e) => { let _ = app.emit("client:progress", ProgressPayload {
            stage: "error".into(), received: 0, total: 0, message: Some(e.to_string()) }); }
    }
    result.map_err(|e| e.to_string())
}

/// Spawn AlfaMP.exe with optional +connect arg. Returns the child PID.
/// The launcher hides itself + monitors the child via `monitor_game()` so it
/// restores when the game exits.
#[tauri::command]
async fn launch_client(app: AppHandle, state: tauri::State<'_, AppState>, endpoint: Option<String>) -> Result<u32, String> {
    let install_dir = client::install_dir();
    let exe = install_dir.join("AlfaMP.exe");
    if !exe.exists() {
        return Err(format!("Alfa MP client not installed at {}", exe.display()));
    }

    let mut cmd = std::process::Command::new(&exe);
    cmd.current_dir(&install_dir);
    if let Some(ep) = endpoint.filter(|s| !s.is_empty()) {
        cmd.arg("+connect").arg(ep);
    }

    // On Windows, mark the child as a separate process group so closing our
    // launcher doesn't take it down (CTRL-events scoped to group).
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        cmd.creation_flags(CREATE_NEW_PROCESS_GROUP);
    }

    let child = cmd.spawn().map_err(|e| format!("spawn failed: {}", e))?;
    let pid = child.id();

    {
        let mut s = state.lock().await;
        s.game_child_pid = Some(pid);
    }
    let _ = app.emit("game:started", pid);

    // Hide the launcher window — user is now playing.
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }

    // Background watcher: poll for child exit, then restore launcher.
    let app2 = app.clone();
    std::thread::spawn(move || {
        let mut child = child;
        let _ = child.wait(); // blocks until the process exits

        let _ = app2.emit("game:exited", pid);
        if let Some(win) = app2.get_webview_window("main") {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    });

    Ok(pid)
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open_external(&url).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[tauri::command]
fn hide_main_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

// Kept for back-compat with any old splash.html that calls it.
#[tauri::command]
fn finish_splash() {}

fn open_external(url: &str) -> anyhow::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd").args(["/C", "start", "", url]).spawn()?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(url).spawn()?; return Ok(()); }
    #[cfg(all(unix, not(target_os = "macos")))]
    { std::process::Command::new("xdg-open").arg(url).spawn()?; return Ok(()); }
    #[allow(unreachable_code)]
    Err(anyhow::anyhow!("unsupported platform"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state: AppState = Arc::new(Mutex::new(AppStateInner {
        downloading: false,
        game_child_pid: None,
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            finish_splash,
            gta_detect,
            client_state,
            download_client,
            launch_client,
            open_url,
            wipe_client,
            show_main_window,
            hide_main_window,
        ])
        .setup(|app| {
            let _ = std::fs::create_dir_all(client::install_dir());

            // Force the main window geometry on startup.
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_min_size(Some(tauri::LogicalSize::new(980.0, 600.0)));
                let _ = main.set_size(tauri::LogicalSize::new(1280.0, 760.0));
                let _ = main.center();
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();

                #[cfg(debug_assertions)]
                main.open_devtools();
            }

            // System-tray icon: lets the user restore the launcher after the game
            // hides it on connect. Right-click: Show / Quit menu.
            let show_item = MenuItem::with_id(app, "show", "Открыть Alfa MP", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Выйти", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("alfamp-tray")
                .tooltip("Alfa MP — нажмите чтобы открыть")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, ev| {
                    match ev.id.as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.unminimize();
                                let _ = win.set_focus();
                            }
                        }
                        "quit" => { app.exit(0); }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Alfa MP launcher");
}

#[allow(dead_code)]
pub(crate) fn install_dir_public() -> PathBuf { client::install_dir() }

#[cfg(test)]
mod tests {
    /// Regression test for the v0.1.10 bug where install_client wrote "0.1.0\n"
    /// to version.txt AFTER extracting the bundle, which made the freshly-installed
    /// bundle look stale to client_state() and re-triggered the install overlay.
    /// This test pins the staleness predicate against actual version strings we
    /// expect the bundle to ship with.
    #[test]
    fn fresh_version_predicate_accepts_real_bundle_versions() {
        fn fresh(v: &str) -> bool {
            let lc = v.to_lowercase();
            if lc.contains("stub") || lc.contains("placeholder") { return false; }
            if lc.starts_with("client-v0.1") || lc.starts_with("0.1.") { return false; }
            true
        }

        // Bundles we have shipped or plan to ship — MUST be fresh.
        for v in &[
            "client-v0.2.0-rebranded",
            "client-v0.2.1-no-updater",
            "client-v0.2.2-clean",
            "client-v0.2.3-no-selfupdate",
            "client-v0.2.4-deep-scrub",
            "alfamp-engine-v1.0",
            "alfamp-engine-v2.0",
        ] {
            assert!(fresh(v), "{} should be considered FRESH but predicate said stale", v);
        }

        // Stale bundles — MUST be flagged.
        for v in &[
            "0.1.0",            // pre-rebrand stub default
            "0.1.0-stub",
            "client-v0.1.0",    // pre-Run#15 bundle
            "client-v0.1.9",
            "client-stub-test",
            "placeholder",
        ] {
            assert!(!fresh(v), "{} should be considered STALE but predicate said fresh", v);
        }
    }
}
