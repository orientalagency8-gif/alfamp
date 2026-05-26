/// Game-client install / download.
///
/// The Alfa MP "game client" is a zip bundle hosted by our master server. It contains:
///   AlfaMP.exe, *.dll, citizen/, version.txt, …
///
/// First-run flow: launcher detects no AlfaMP.exe at %LocalAppData%\AlfaMP\client\,
/// the user clicks "Install", we stream the zip from the master, extract it,
/// and emit `client:progress` events so the UI shows a progress bar.

use std::io::{Read, Write};
use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};

use crate::ProgressPayload;

pub fn install_dir() -> PathBuf {
    // %LocalAppData%\AlfaMP\client  on Windows
    // ~/.local/share/AlfaMP/client elsewhere
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("AlfaMP").join("client")
}

fn tmp_zip_path() -> PathBuf {
    install_dir().parent().unwrap_or(&PathBuf::from(".")).join("client-download.zip.part")
}

pub async fn download_and_install(app: AppHandle, url: String) -> Result<()> {
    let dest_dir = install_dir();
    std::fs::create_dir_all(&dest_dir).context("create install dir")?;
    std::fs::create_dir_all(dest_dir.parent().unwrap()).ok();

    let tmp = tmp_zip_path();
    if tmp.exists() { let _ = std::fs::remove_file(&tmp); }

    let _ = app.emit("client:progress", ProgressPayload {
        stage: "downloading".into(), received: 0, total: 0,
        message: Some(format!("contacting {}", url)),
    });

    let client = reqwest::Client::builder()
        .user_agent("AlfaMP-Launcher/0.1")
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .context("reqwest client")?;
    let resp = client.get(&url).send().await
        .with_context(|| format!("GET {}", url))?;

    if !resp.status().is_success() {
        return Err(anyhow!("download HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    let mut received: u64 = 0;
    let mut stream = resp.bytes_stream();

    let mut file = std::fs::File::create(&tmp)
        .with_context(|| format!("create {}", tmp.display()))?;

    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.context("read chunk")?;
        file.write_all(&bytes).context("write chunk")?;
        received += bytes.len() as u64;
        if last_emit.elapsed() >= std::time::Duration::from_millis(150) {
            let _ = app.emit("client:progress", ProgressPayload {
                stage: "downloading".into(), received, total, message: None,
            });
            last_emit = std::time::Instant::now();
        }
    }
    drop(file);

    let _ = app.emit("client:progress", ProgressPayload {
        stage: "extracting".into(), received, total, message: Some("unpacking…".into()),
    });

    // Move heavy zip extraction to a blocking thread.
    let tmp2 = tmp.clone();
    let dest2 = dest_dir.clone();
    let app2 = app.clone();
    let extracted = tokio::task::spawn_blocking(move || -> Result<()> {
        extract_zip(&tmp2, &dest2, |done, total_items| {
            let _ = app2.emit("client:progress", ProgressPayload {
                stage: "extracting".into(),
                received: done as u64,
                total: total_items as u64,
                message: None,
            });
        })
    }).await.context("join extractor")??;
    let _ = extracted;

    // Clean up the temp zip
    let _ = std::fs::remove_file(&tmp);

    // Write a small version stamp (best-effort)
    let _ = std::fs::write(dest_dir.join("version.txt"), "0.1.0\n");

    Ok(())
}

fn extract_zip<P, Q, F>(zip_path: P, dest: Q, mut on_progress: F) -> Result<()>
where
    P: AsRef<std::path::Path>,
    Q: AsRef<std::path::Path>,
    F: FnMut(usize, usize),
{
    let file = std::fs::File::open(zip_path.as_ref())
        .with_context(|| format!("open zip {}", zip_path.as_ref().display()))?;
    let mut archive = zip::ZipArchive::new(file).context("parse zip")?;
    let total = archive.len();

    for i in 0..total {
        let mut entry = archive.by_index(i).context("read entry")?;
        let outpath = match entry.enclosed_name() {
            Some(p) => dest.as_ref().join(p),
            None => continue,
        };
        if entry.is_dir() {
            std::fs::create_dir_all(&outpath).ok();
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let mut outfile = std::fs::File::create(&outpath)
                .with_context(|| format!("create {}", outpath.display()))?;
            let mut buf = [0u8; 64 * 1024];
            loop {
                let n = entry.read(&mut buf).context("read zip entry")?;
                if n == 0 { break; }
                outfile.write_all(&buf[..n]).context("write file")?;
            }
        }
        if i % 32 == 0 || i + 1 == total {
            on_progress(i + 1, total);
        }
    }
    Ok(())
}
