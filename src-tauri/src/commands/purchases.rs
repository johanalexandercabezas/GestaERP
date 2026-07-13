use tauri::State;
use crate::AppState;
use crate::auth_guard;

#[tauri::command]
pub fn check_invoice_duplicate(state: State<AppState>, supplier_id: i64, invoice_number: String) -> Result<bool, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM purchases WHERE supplier_id = ?1 AND invoice_number = ?2", rusqlite::params![supplier_id, invoice_number], |row| row.get(0)).map_err(|e| format!("Error al verificar factura: {}", e))?;
    Ok(count > 0)
}

#[tauri::command]
pub fn create_purchase(state: State<AppState>, supplier_id: Option<i64>, supplier: String, invoice_number: String, items: Vec<crate::purchases::PurchaseItemRequest>) -> Result<i64, String> {
    auth_guard::require_admin(&state)?;
    // CORRECCIÓN DE AUDITORÍA: Obtener user_id del backend
    let user_id = auth_guard::current_user_id(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::purchases::create_purchase(&conn, user_id, supplier_id, &supplier, &invoice_number, &items).map_err(|e| format!("Error al crear la compra: {}", e))
}

#[tauri::command]
pub fn get_recent_purchases(state: State<AppState>) -> Result<Vec<crate::purchases::PurchaseWithItems>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::purchases::get_recent_purchases(&conn).map_err(|e| format!("Error: {}", e))
}