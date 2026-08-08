use crate::auth_guard;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn create_physical_count(
    state: State<AppState>,
    notes: String,
    product_ids: Option<Vec<i64>>,
) -> Result<i64, String> {
    // CORRECCIÓN IDOR: user_id se obtiene del backend, no del frontend
    let user_id = auth_guard::current_user_id(&state)?;
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let count_id = crate::physical_inventory::create_physical_count(&conn, user_id, &notes)
        .map_err(|e| e.to_string())?;
    crate::physical_inventory::add_items_to_count(&conn, count_id, product_ids)
        .map_err(|e| e.to_string())?;
    Ok(count_id)
}

#[tauri::command]
pub fn update_counted_qty(
    state: State<AppState>,
    item_id: i64,
    counted_qty: String,
) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let qty = counted_qty
        .parse::<f64>()
        .map_err(|_| "Cantidad inválida".to_string())?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::physical_inventory::update_counted_qty(&conn, item_id, qty).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_physical_counts(
    state: State<AppState>,
) -> Result<Vec<crate::physical_inventory::PhysicalCount>, String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::physical_inventory::list_physical_counts(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_physical_count(
    state: State<AppState>,
    count_id: i64,
) -> Result<crate::physical_inventory::PhysicalCountWithItems, String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::physical_inventory::get_physical_count(&conn, count_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apply_adjustments(state: State<AppState>, count_id: i64) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::physical_inventory::apply_adjustments(&conn, count_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_count_status(
    state: State<AppState>,
    count_id: i64,
    status: String,
) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::physical_inventory::update_count_status(&conn, count_id, &status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_inventory_audit_summary(
    state: State<AppState>,
    count_id: i64,
) -> Result<crate::physical_inventory::AuditSummary, String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::physical_inventory::get_audit_summary(&conn, count_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_stock_validation_report(
    state: State<AppState>,
    count_id: i64,
) -> Result<String, String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let business_name =
        crate::db::get_setting(&conn, "nombre_negocio").unwrap_or_else(|| "Mi Negocio".to_string());
    crate::physical_inventory::generate_stock_validation_report(&conn, count_id, &business_name)
        .map_err(|e| e.to_string())
}
