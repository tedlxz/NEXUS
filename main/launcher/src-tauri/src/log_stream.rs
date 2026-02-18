use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::pm2;

/// Spawn `pm2 logs nexus --raw --lines 50` and emit each line as a "log-line" event.
/// Merges stdout and stderr into the same stream.
pub fn start_log_stream(app: AppHandle) {
    let Some(pm2_path) = pm2::resolve_pm2_path() else {
        let _ = app.emit("log-line", "[launcher] PM2 not found — log stream unavailable");
        return;
    };

    tauri::async_runtime::spawn(async move {
        loop {
            let result = run_log_child(&app, &pm2_path).await;
            if let Err(e) = result {
                let _ = app.emit("log-line", format!("[launcher] Log stream error: {}", e));
            }
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            let _ = app.emit("log-line", "[launcher] Reconnecting log stream...");
        }
    });
}

async fn run_log_child(
    app: &AppHandle,
    pm2_path: &std::path::Path,
) -> Result<(), String> {
    let mut child = Command::new(pm2_path)
        .args(["logs", "nexus", "--raw", "--lines", "50"])
        .env("PATH", pm2::enhanced_path())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn pm2 logs: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_out = app.clone();
    let stdout_task = tokio::spawn(async move {
        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if !line.trim().is_empty() {
                    let _ = app_out.emit("log-line", &line);
                }
            }
        }
    });

    let app_err = app.clone();
    let stderr_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if !line.trim().is_empty() {
                    let _ = app_err.emit("log-line", &line);
                }
            }
        }
    });

    let _ = tokio::join!(stdout_task, stderr_task);
    let _ = child.wait().await;

    Ok(())
}
