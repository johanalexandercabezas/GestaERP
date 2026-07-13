use tauri::State;
use crate::AppState;
use crate::auth_guard;
use crate::calendar_notes;

#[tauri::command]
pub fn create_calendar_note(state: State<AppState>, date: String, title: String, description: String, priority: String, notification_date: Option<String>) -> Result<i64, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    calendar_notes::create_note(&conn, &date, &title, &description, &priority, notification_date.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_calendar_notes(state: State<AppState>) -> Result<Vec<calendar_notes::CalendarNote>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    calendar_notes::list_notes(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_calendar_note(state: State<AppState>, id: i64, title: String, description: String, priority: String, completed: bool, notification_date: Option<String>) -> Result<(), String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    calendar_notes::update_note(&conn, id, &title, &description, &priority, completed, notification_date.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_calendar_note(state: State<AppState>, id: i64) -> Result<(), String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    calendar_notes::delete_note(&conn, id).map_err(|e| e.to_string())
}