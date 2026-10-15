use crate::auth_guard;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn list_personal_data_basis_history(
    state: State<AppState>,
    subject_type: String,
    subject_id: i64,
) -> Result<Vec<crate::personal_data::ProcessingBasisRecord>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::personal_data::list_records(&conn, &subject_type, subject_id)
}
