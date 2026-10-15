use crate::auth_guard;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn create_supplier(
    state: State<AppState>,
    name: String,
    nit: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    doc_type: Option<String>,
    city: Option<String>,
    address: Option<String>,
    payment_method: Option<String>,
    bank_name: Option<String>,
    bank_account: Option<String>,
    iva_responsible: bool,
    offers_credit: bool,
    credit_days: i64,
    credit_limit: f64,
    processing_basis: crate::personal_data::ProcessingBasisInput,
) -> Result<i64, String> {
    auth_guard::require_admin(&state)?;
    let user = auth_guard::current_user(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let transaction = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let id = crate::suppliers::create_supplier(
        &transaction,
        &name,
        nit.as_deref(),
        phone.as_deref(),
        email.as_deref(),
        doc_type.as_deref(),
        city.as_deref(),
        address.as_deref(),
        payment_method.as_deref(),
        bank_name.as_deref(),
        bank_account.as_deref(),
        iva_responsible,
        offers_credit,
        credit_days,
        credit_limit,
    )
    .map_err(|e| format!("Error al crear proveedor: {}", e))?;
    crate::personal_data::record_basis(
        &transaction,
        "supplier",
        id,
        &processing_basis,
        user.id,
        &user.full_name,
    )?;
    transaction
        .commit()
        .map_err(|e| format!("No se pudo confirmar el registro del proveedor: {e}"))?;
    Ok(id)
}

#[tauri::command]
pub fn list_suppliers(state: State<AppState>) -> Result<Vec<crate::suppliers::Supplier>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::suppliers::list_suppliers(&conn)
        .map_err(|e| format!("Error al listar proveedores: {}", e))
}

#[tauri::command]
pub fn update_supplier(
    state: State<AppState>,
    id: i64,
    name: String,
    nit: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    doc_type: Option<String>,
    city: Option<String>,
    address: Option<String>,
    payment_method: Option<String>,
    bank_name: Option<String>,
    bank_account: Option<String>,
    iva_responsible: bool,
    offers_credit: bool,
    credit_days: i64,
    credit_limit: f64,
    processing_basis: crate::personal_data::ProcessingBasisInput,
) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let user = auth_guard::current_user(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let transaction = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let s = crate::suppliers::Supplier {
        id,
        name,
        nit,
        phone,
        email,
        doc_type,
        city,
        address,
        payment_method,
        bank_name,
        bank_account,
        iva_responsible,
        offers_credit,
        credit_days,
        credit_limit,
        processing_basis: None,
    };
    crate::suppliers::update_supplier(&transaction, &s)
        .map_err(|e| format!("Error al actualizar proveedor: {}", e))?;
    crate::personal_data::record_basis(
        &transaction,
        "supplier",
        id,
        &processing_basis,
        user.id,
        &user.full_name,
    )?;
    transaction
        .commit()
        .map_err(|e| format!("No se pudo confirmar la actualización del proveedor: {e}"))
}

#[tauri::command]
pub fn delete_supplier(state: State<AppState>, id: i64) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::suppliers::delete_supplier(&conn, id)
        .map_err(|e| format!("Error al eliminar proveedor: {}", e))
}
