use crate::auth_guard;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn create_customer(
    state: State<AppState>,
    name: String,
    doc_type: Option<String>,
    doc_number: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    processing_basis: crate::personal_data::ProcessingBasisInput,
) -> Result<i64, String> {
    auth_guard::require_auth(&state)?;
    let user = auth_guard::current_user(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let transaction = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let id = crate::customers::create_customer(
        &transaction,
        &name,
        doc_type.as_deref(),
        doc_number.as_deref(),
        phone.as_deref(),
        email.as_deref(),
    )
    .map_err(|e| format!("Error al crear cliente: {}", e))?;
    crate::personal_data::record_basis(
        &transaction,
        "customer",
        id,
        &processing_basis,
        user.id,
        &user.full_name,
    )?;
    transaction
        .commit()
        .map_err(|e| format!("No se pudo confirmar el registro del cliente: {e}"))?;
    Ok(id)
}

#[tauri::command]
pub fn list_customers(state: State<AppState>) -> Result<Vec<crate::customers::Customer>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::customers::list_customers(&conn).map_err(|e| format!("Error al listar clientes: {}", e))
}

#[tauri::command]
pub fn update_customer(
    state: State<AppState>,
    id: i64,
    name: String,
    doc_type: Option<String>,
    doc_number: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    processing_basis: crate::personal_data::ProcessingBasisInput,
) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let user = auth_guard::current_user(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let transaction = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let c = crate::customers::Customer {
        id,
        name,
        doc_type,
        doc_number,
        phone,
        email,
        processing_basis: None,
    };
    crate::customers::update_customer(&transaction, &c)
        .map_err(|e| format!("Error al actualizar cliente: {}", e))?;
    crate::personal_data::record_basis(
        &transaction,
        "customer",
        id,
        &processing_basis,
        user.id,
        &user.full_name,
    )?;
    transaction
        .commit()
        .map_err(|e| format!("No se pudo confirmar la actualización del cliente: {e}"))
}

#[tauri::command]
pub fn delete_customer(state: State<AppState>, id: i64) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::customers::delete_customer(&conn, id)
        .map_err(|e| format!("Error al eliminar cliente: {}", e))
}
