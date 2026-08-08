use crate::auth_guard;
use crate::utils::parse_f64;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn open_cash_register(state: State<AppState>, initial_balance: String) -> Result<i64, String> {
    auth_guard::require_auth(&state)?;
    let initial_balance = parse_f64(&initial_balance, "monto inicial")?;

    // CORRECCIÓN IDOR: Obtener user_id del backend
    let user_id = auth_guard::current_user_id(&state)?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::cash_register::open_register(&conn, user_id, initial_balance)
        .map_err(|e| format!("Error al abrir caja: {}", e))
}

#[tauri::command]
pub fn close_cash_register(
    state: State<AppState>,
    register_id: i64,
    final_balance: String,
) -> Result<(), String> {
    auth_guard::require_auth(&state)?;
    let final_balance = parse_f64(&final_balance, "monto final")?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::cash_register::close_register(&conn, register_id, final_balance)
        .map_err(|e| format!("Error al cerrar caja: {}", e))
}

#[tauri::command]
pub fn get_open_register(
    state: State<AppState>,
) -> Result<Option<crate::cash_register::CashRegister>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::cash_register::get_open_register(&conn)
        .map_err(|e| format!("Error al consultar caja: {}", e))
}

#[tauri::command]
pub fn get_recent_registers(
    state: State<AppState>,
) -> Result<Vec<crate::cash_register::CashRegister>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::cash_register::get_recent_registers(&conn, 10)
        .map_err(|e| format!("Error al listar cajas: {}", e))
}
