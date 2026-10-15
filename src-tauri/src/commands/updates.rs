use crate::auth_guard;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn get_app_version(state: State<AppState>) -> Result<String, String> {
    auth_guard::require_auth(&state)?;
    Ok(env!("CARGO_PKG_VERSION").to_string())
}
