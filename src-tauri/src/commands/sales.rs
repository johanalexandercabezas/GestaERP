use tauri::State;
use crate::AppState;
use crate::auth_guard;
use crate::sales;

#[tauri::command]
pub fn create_sale_v2(
    state: State<AppState>,
    payment_method: String,
    items: Vec<sales::SaleItemRequest>,
    customer_id: Option<i64>,
    customer_name: Option<String>,
    discount_percent: f64,
) -> Result<i64, String> {
    // CORRECCIÓN IDOR + autorización: user_id del backend + sesión obligatoria
    let user_id = auth_guard::current_user_id(&state)?;

    // Validar datos de crédito antes de abrir transacción
    if payment_method == "Crédito" && (customer_id.is_none() || customer_name.is_none()) {
        return Err("Se requiere cliente para venta a crédito".to_string());
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;

    sales::create_sale_complete(
        &conn,
        user_id,
        &payment_method,
        &items,
        customer_id,
        customer_name.as_deref(),
        discount_percent,
    )
    .map_err(|e| format!("Error al crear la venta: {}", e))
}

#[tauri::command]
pub fn get_recent_sales(state: State<AppState>) -> Result<Vec<sales::SaleWithItems>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    sales::get_recent_sales(&conn).map_err(|e| format!("Error: {}", e))
}