use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

static PM2_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();
static ENHANCED_PATH: OnceLock<String> = OnceLock::new();

/// Build a PATH that includes common node/homebrew locations.
/// Finder-launched .app bundles get a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin)
/// which doesn't include node, npm, or pm2.
pub fn enhanced_path() -> &'static str {
    ENHANCED_PATH.get_or_init(|| {
        let extra_dirs = [
            "/opt/homebrew/bin",
            "/opt/homebrew/sbin",
            "/usr/local/bin",
            "/usr/local/sbin",
        ];

        let home = std::env::var("HOME").unwrap_or_default();
        let mut dirs: Vec<String> = extra_dirs.iter().map(|s| s.to_string()).collect();

        // Probe nvm-managed node
        let nvm_default = format!("{}/.nvm/versions/node", home);
        if let Ok(entries) = std::fs::read_dir(&nvm_default) {
            let mut versions: Vec<PathBuf> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect();
            versions.sort();
            if let Some(latest) = versions.last() {
                dirs.push(format!("{}/bin", latest.display()));
            }
        }

        let sys_path = std::env::var("PATH").unwrap_or_default();
        dirs.push(sys_path);

        dirs.join(":")
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessStatus {
    pub status: String,
    pub pid: Option<u32>,
    pub uptime_ms: Option<u64>,
    pub memory_bytes: Option<u64>,
    pub restarts: Option<u32>,
}

impl ProcessStatus {
    fn not_found() -> Self {
        Self {
            status: "not_found".into(),
            pid: None,
            uptime_ms: None,
            memory_bytes: None,
            restarts: None,
        }
    }
}

/// Resolve the pm2 binary path once at startup.
pub fn resolve_pm2_path() -> Option<PathBuf> {
    PM2_PATH
        .get_or_init(|| {
            let candidates = [
                "/opt/homebrew/bin/pm2",
                "/usr/local/bin/pm2",
            ];

            for path in &candidates {
                let p = PathBuf::from(path);
                if p.exists() {
                    return Some(p);
                }
            }

            if let Ok(output) = Command::new("which").arg("pm2").output() {
                let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path_str.is_empty() {
                    let p = PathBuf::from(&path_str);
                    if p.exists() {
                        return Some(p);
                    }
                }
            }

            None
        })
        .clone()
}

fn pm2_bin() -> Result<PathBuf, String> {
    resolve_pm2_path().ok_or_else(|| "PM2 binary not found".into())
}

/// Get the current status of the "nexus" PM2 process.
pub fn get_status() -> Result<ProcessStatus, String> {
    let pm2 = pm2_bin()?;

    let output = Command::new(&pm2)
        .arg("jlist")
        .env("PATH", enhanced_path())
        .output()
        .map_err(|e| format!("Failed to run pm2 jlist: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();

    if trimmed.is_empty() || trimmed == "[]" {
        return Ok(ProcessStatus::not_found());
    }

    let list: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|e| format!("Failed to parse pm2 jlist: {}", e))?;

    let processes = list.as_array().ok_or("pm2 jlist did not return an array")?;

    for proc in processes {
        let name = proc.get("name").and_then(|v| v.as_str()).unwrap_or("");
        if name != "nexus" {
            continue;
        }

        let pm2_env = proc.get("pm2_env");
        let status = pm2_env
            .and_then(|e| e.get("status"))
            .and_then(|v| v.as_str())
            .unwrap_or("stopped")
            .to_string();

        let pid = proc.get("pid").and_then(|v| v.as_u64()).map(|v| v as u32);

        let uptime_ms = pm2_env
            .and_then(|e| e.get("pm_uptime"))
            .and_then(|v| v.as_u64())
            .map(|start| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                now.saturating_sub(start)
            });

        let memory_bytes = proc
            .get("monit")
            .and_then(|m| m.get("memory"))
            .and_then(|v| v.as_u64());

        let restarts = pm2_env
            .and_then(|e| e.get("restart_time"))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);

        return Ok(ProcessStatus {
            status,
            pid,
            uptime_ms,
            memory_bytes,
            restarts,
        });
    }

    Ok(ProcessStatus::not_found())
}

/// Execute a PM2 action on the "nexus" process.
pub fn pm2_action(action: &str) -> Result<String, String> {
    let pm2 = pm2_bin()?;

    let output = if action == "start" {
        let status = get_status()?;
        if status.status == "not_found" {
            let main_path = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent()?.parent()?.parent()?.parent().map(|p| p.to_path_buf()))
                .unwrap_or_else(|| PathBuf::from("/Users/tedliu/Desktop/Project NEXUS/main"));

            Command::new(&pm2)
                .args([
                    "start",
                    "dist/index.js",
                    "--name",
                    "nexus",
                    "--cwd",
                    &main_path.to_string_lossy(),
                ])
                .env("PATH", enhanced_path())
                .output()
                .map_err(|e| format!("Failed to start nexus: {}", e))?
        } else {
            Command::new(&pm2)
                .args(["start", "nexus"])
                .env("PATH", enhanced_path())
                .output()
                .map_err(|e| format!("Failed to start nexus: {}", e))?
        }
    } else {
        Command::new(&pm2)
            .args([action, "nexus"])
            .env("PATH", enhanced_path())
            .output()
            .map_err(|e| format!("Failed to {} nexus: {}", action, e))?
    };

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!("{}{}", stderr, stdout))
    }
}
