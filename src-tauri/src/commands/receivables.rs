use crate::auth_guard;
use crate::utils::parse_f64;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn list_receivables(
    state: State<AppState>,
) -> Result<Vec<crate::receivables::Receivable>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::receivables::list_receivables(&conn)
        .map_err(|e| format!("Error al listar cuentas: {}", e))
}

#[tauri::command]
pub fn register_payment(
    state: State<AppState>,
    receivable_id: i64,
    amount: String,
    payment_method: String,
) -> Result<(), String> {
    auth_guard::require_auth(&state)?;
    let amount = parse_f64(&amount, "monto")?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::receivables::register_payment(&conn, receivable_id, amount, &payment_method)
        .map_err(|e| format!("Error al registrar abono: {}", e))
}
