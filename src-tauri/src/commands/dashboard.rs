use tauri::State;
use crate::AppState;
use crate::auth_guard;

#[tauri::command]
pub fn get_dashboard_data(state: State<AppState>) -> Result<crate::db::DashboardStats, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::db::get_dashboard_stats(&conn).map_err(|e| format!("Error en base de datos: {}", e))
}