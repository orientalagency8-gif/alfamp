use tauri::Manager;

#[tauri::command]
fn finish_splash(app: tauri::AppHandle) {
    // Splash → Main: close the splash, show the main window.
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![finish_splash])
        .setup(|app| {
            // The main window is created hidden (visible:false in tauri.conf.json).
            // Splash auto-shows; after ~2.5s it invokes `finish_splash` from JS,
            // which closes splash and shows main.
            #[cfg(debug_assertions)]
            if let Some(win) = app.get_webview_window("main") { win.open_devtools(); }
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Alfa MP launcher");
}
