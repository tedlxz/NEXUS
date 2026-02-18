use crate::pm2;

#[tauri::command]
pub async fn get_process_status() -> Result<pm2::ProcessStatus, String> {
    tokio::task::spawn_blocking(pm2::get_status)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn pm2_command(action: String) -> Result<String, String> {
    let valid = ["start", "restart", "stop"];
    if !valid.contains(&action.as_str()) {
        return Err(format!("Invalid action: {}. Must be start, restart, or stop.", action));
    }

    tokio::task::spawn_blocking(move || pm2::pm2_action(&action))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}
