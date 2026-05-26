/// GTA V auto-detection.
///
/// Search order:
///  1. Steam library (registry → SteamApps/common/Grand Theft Auto V)
///  2. Rockstar Games Launcher (registry HKLM)
///  3. Epic Games Launcher manifests
///  4. Common fallback paths

use std::path::{Path, PathBuf};

/// Returns the directory that contains GTA5.exe, or None if not found.
pub fn detect_gta_path() -> Option<String> {
    if let Some(p) = detect_steam() { return Some(p); }
    if let Some(p) = detect_rockstar() { return Some(p); }
    if let Some(p) = detect_epic() { return Some(p); }
    if let Some(p) = detect_fallback() { return Some(p); }
    None
}

fn contains_gta_exe(dir: &Path) -> bool {
    dir.join("GTA5.exe").is_file()
}

#[cfg(windows)]
fn detect_steam() -> Option<String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // Find Steam install path
    let steam_path: Option<PathBuf> = hkcu.open_subkey("Software\\Valve\\Steam")
        .ok()
        .and_then(|k| k.get_value::<String, _>("SteamPath").ok())
        .or_else(|| hklm.open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam")
                    .ok()
                    .and_then(|k| k.get_value::<String, _>("InstallPath").ok()))
        .map(PathBuf::from);

    let steam = steam_path?;
    // Default library
    let default_lib = steam.join("steamapps").join("common").join("Grand Theft Auto V");
    if contains_gta_exe(&default_lib) {
        return Some(default_lib.to_string_lossy().into_owned());
    }

    // Parse libraryfolders.vdf for extra libraries
    let lf = steam.join("steamapps").join("libraryfolders.vdf");
    if let Ok(text) = std::fs::read_to_string(&lf) {
        for line in text.lines() {
            // Match lines like:    "path"        "D:\\SteamLibrary"
            let t = line.trim();
            if !t.starts_with("\"path\"") { continue; }
            if let Some(start) = t.rfind("\"") {
                let s = &t[..start];
                if let Some(open) = s.rfind("\"") {
                    let p = &t[open + 1 .. start];
                    let cand = PathBuf::from(p.replace("\\\\", "\\"))
                        .join("steamapps").join("common").join("Grand Theft Auto V");
                    if contains_gta_exe(&cand) {
                        return Some(cand.to_string_lossy().into_owned());
                    }
                }
            }
        }
    }
    None
}

#[cfg(windows)]
fn detect_rockstar() -> Option<String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    let candidates = [
        "SOFTWARE\\WOW6432Node\\Rockstar Games\\Grand Theft Auto V",
        "SOFTWARE\\Rockstar Games\\Grand Theft Auto V",
        "SOFTWARE\\WOW6432Node\\Rockstar Games\\GTAV",
        "SOFTWARE\\Rockstar Games\\GTAV",
    ];
    for key_path in candidates {
        if let Ok(k) = hklm.open_subkey(key_path) {
            if let Ok(p) = k.get_value::<String, _>("InstallFolder") {
                let pb = PathBuf::from(&p);
                if contains_gta_exe(&pb) { return Some(p); }
            }
            if let Ok(p) = k.get_value::<String, _>("InstallLocation") {
                let pb = PathBuf::from(&p);
                if contains_gta_exe(&pb) { return Some(p); }
            }
        }
    }
    None
}

#[cfg(windows)]
fn detect_epic() -> Option<String> {
    // Epic stores manifests at C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item
    let manifests = PathBuf::from("C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests");
    let read = std::fs::read_dir(&manifests).ok()?;
    for entry in read.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("item") { continue; }
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        // Simple JSON peek for GTAV display name and InstallLocation
        if !(text.contains("\"DisplayName\"") && (text.contains("Grand Theft Auto V") || text.contains("GTA V") || text.contains("GTAV"))) {
            continue;
        }
        if let Some(idx) = text.find("\"InstallLocation\"") {
            let rest = &text[idx..];
            if let Some(colon) = rest.find(':') {
                let after = &rest[colon + 1..];
                if let Some(q1) = after.find('"') {
                    let after2 = &after[q1 + 1..];
                    if let Some(q2) = after2.find('"') {
                        let raw = &after2[..q2];
                        // JSON-encoded backslashes (\\) → \
                        let p = raw.replace("\\\\", "\\");
                        let pb = PathBuf::from(&p);
                        if contains_gta_exe(&pb) { return Some(p); }
                    }
                }
            }
        }
    }
    None
}

#[cfg(windows)]
fn detect_fallback() -> Option<String> {
    let candidates = [
        "C:\\Program Files\\Rockstar Games\\Grand Theft Auto V",
        "C:\\Program Files (x86)\\Rockstar Games\\Grand Theft Auto V",
        "C:\\Program Files\\Epic Games\\GTAV",
        "C:\\Program Files (x86)\\Epic Games\\GTAV",
        "C:\\Games\\Grand Theft Auto V",
        "D:\\Grand Theft Auto V",
        "D:\\Games\\Grand Theft Auto V",
        "E:\\Games\\Grand Theft Auto V",
    ];
    for p in candidates {
        let pb = PathBuf::from(p);
        if contains_gta_exe(&pb) { return Some(p.to_string()); }
    }
    None
}

// --- Non-Windows stubs -------------------------------------------------------

#[cfg(not(windows))]
fn detect_steam() -> Option<String> { None }

#[cfg(not(windows))]
fn detect_rockstar() -> Option<String> { None }

#[cfg(not(windows))]
fn detect_epic() -> Option<String> { None }

#[cfg(not(windows))]
fn detect_fallback() -> Option<String> { None }
