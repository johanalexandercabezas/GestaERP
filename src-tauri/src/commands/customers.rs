use tauri::State;
use crate::AppState;
use crate::auth_guard;

#[tauri::command]
pub fn create_customer(state: State<AppState>, name: String, doc_type: Option<String>, doc_number: Option<String>, phone: Option<String>, email: Option<String>) -> Result<i64, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::customers::create_customer(&conn, &name, doc_type.as_deref(), doc_number.as_deref(), phone.as_deref(), email.as_deref())
        .map_err(|e| format!("Error al crear cliente: {}", e))
}

#[tauri::command]
pub fn list_customers(state: State<AppState>) -> Result<Vec<crate::customers::Customer>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::customers::list_customers(&conn).map_err(|e| format!("Error al listar clientes: {}", e))
}

#[tauri::command]
pub fn update_customer(state: State<AppState>, id: i64, name: String, doc_type: Option<String>, doc_number: Option<String>, phone: Option<String>, email: Option<String>) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let c = crate::customers::Customer { id, name, doc_type, doc_number, phone, email };
    crate::customers::update_customer(&conn, &c).map_err(|e| format!("Error al actualizar cliente: {}", e))
}

#[tauri::command]
pub fn delete_customer(state: State<AppState>, id: i64) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::customers::delete_customer(&conn, id).map_err(|e| format!("Error al eliminar cliente: {}", e))
}