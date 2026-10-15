use crate::{legal, AppState};
use tauri::State;

#[tauri::command]
pub fn get_legal_acceptance_status(
    state: State<AppState>,
) -> Result<legal::LegalAcceptanceStatus, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    legal::acceptance_status(&conn)
}

#[tauri::command]
pub fn accept_current_legal_documents(
    state: State<AppState>,
    app: tauri::AppHandle,
    terms_accepted: bool,
    privacy_notice_acknowledged: bool,
) -> Result<legal::LegalAcceptanceStatus, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    legal::accept_current_documents(
        &conn,
        terms_accepted,
        privacy_notice_acknowledged,
        &app.package_info().version.to_string(),
    )
}
