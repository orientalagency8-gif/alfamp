use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
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
    let installed = client_path.exists();
    let version = std::fs::read_to_string(install_dir.join("version.txt"))
        .ok()
        .map(|s| s.trim().to_string());
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
async fn download_client(app: AppHandle, state: tauri::State<'_, AppState>, url: String) -> Result<(), String> {
    {
        let mut s = state.lock().await;
        if s.downloading {
            return Err("already downloading".into());
        }
        s.downloading = true;
    }
    let result = client::download_and_install(app.clone(), url).await;
    {
        let mut s = state.lock().await;
        s.downloading = false;
    }
    match &result {
        Ok(()) => {
            let _ = app.emit("client:progress", ProgressPayload {
                stage: "done".into(), received: 0, total: 0, message: None,
            });
        }
        Err(e) => {
            let _ = app.emit("client:progress", ProgressPayload {
                stage: "error".into(), received: 0, total: 0, message: Some(e.to_string()),
            });
        }
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
fn launch_client(endpoint: Option<String>) -> Result<(), String> {
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
    cmd.spawn().map_err(|e| format!("failed to launch client: {}", e))?;
    Ok(())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open_external(&url).map_err(|e| e.to_string())
}

// Back-compat: the splash window was removed in v0.1.5 but the old splash.html
// (if still served) calls `finish_splash`. Accept the invoke silently.
#[tauri::command]
fn finish_splash() {}

fn open_external(url: &str) -> anyhow::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()?;
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
    let state: AppState = Arc::new(Mutex::new(AppStateInner { downloading: false }));

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
        ])
        .setup(|app| {
            // Ensure the install dir exists early.
            let _ = std::fs::create_dir_all(client::install_dir());

            // Force main window geometry on startup. Belt-and-suspenders fix for
            // a Tauri 2 quirk where main windows configured with `visible: false`
            // (or sometimes even visible:true) come up at a tiny default size
            // on Windows.
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Alfa MP launcher");
}

#[allow(dead_code)]
pub(crate) fn install_dir_public() -> PathBuf { client::install_dir() }
