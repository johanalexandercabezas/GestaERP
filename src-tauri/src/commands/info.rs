use crate::AppInfo;
use crate::AppState;
use chrono::Local;
use tauri::State;

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        backend: "Rust + SQLite".to_string(),
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    }
}

#[tauri::command]
pub fn is_db_ready(state: State<AppState>) -> bool {
    state.db.lock().is_ok()
}
