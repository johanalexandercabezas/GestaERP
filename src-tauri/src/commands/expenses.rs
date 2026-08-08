use crate::auth_guard;
use crate::transaction::TransactionGuard;
use crate::utils::parse_f64;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn create_expense(
    state: State<AppState>,
    description: String,
    amount: String,
    category: String,
    payment_method: String,
    supplier_id: Option<i64>,
    supplier_name: Option<String>,
) -> Result<i64, String> {
    auth_guard::require_admin(&state)?;
    let amount = parse_f64(&amount, "monto")?;

    // CORRECCIÓN IDOR: Obtener user_id del backend
    let user_id = auth_guard::current_user_id(&state)?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // CORRECCIÓN DE AUDITORÍA: Transacción Atómica (Caja + Gasto)
    let tx = TransactionGuard::begin(&conn)?;

    if payment_method == "Efectivo" {
        crate::cash_register::increment_balance_in_transaction(&conn, -amount)
            .map_err(|e| format!("Error al actualizar caja: {}", e))?;
    }

    crate::expenses::create_expense(
        &conn,
        user_id,
        &description,
        amount,
        &category,
        &payment_method,
        supplier_id,
        supplier_name.as_deref(),
    )
    .map_err(|e| format!("Error al registrar gasto: {}", e))?;

    tx.commit()?; // Si algo falló arriba, el Drop hace ROLLBACK automático

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn list_expenses(
    state: State<AppState>,
    supplier_id: Option<i64>,
) -> Result<Vec<crate::expenses::Expense>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::expenses::list_expenses(&conn, 500, supplier_id)
        .map_err(|e| format!("Error al listar gastos: {}", e))
}
