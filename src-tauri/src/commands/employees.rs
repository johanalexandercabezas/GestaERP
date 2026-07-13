use tauri::State;
use crate::AppState;
use crate::auth_guard;
use crate::utils::parse_f64;

#[tauri::command]
pub fn create_employee(
    state: State<AppState>,
    name: String,
    doc_type: Option<String>,
    doc_number: Option<String>,
    position: Option<String>,
    base_salary: String,
    transport_allowance: bool,
    has_social_security: bool,
    payment_frequency: Option<String>,
    risk_level: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    city: Option<String>,
    department: Option<String>,
    address: Option<String>,
    hire_date: Option<String>,
    eps: Option<String>,
    arl: Option<String>,
    afp: Option<String>,
    ccf: Option<String>,
    fondo_cesantias: Option<String>,
) -> Result<i64, String> {
    auth_guard::require_admin(&state)?;
    let base_salary = parse_f64(&base_salary, "salario base")?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::payroll::create_employee(
        &conn,
        &name,
        doc_type.as_deref(),
        doc_number.as_deref(),
        position.as_deref(),
        base_salary,
        transport_allowance,
        has_social_security,
        payment_frequency.as_deref().unwrap_or("Mensual"),
        risk_level.as_deref().unwrap_or("I"),
        phone.as_deref(),
        email.as_deref(),
        city.as_deref(),
        department.as_deref(),
        address.as_deref(),
        hire_date.as_deref(),
        eps.as_deref(),
        arl.as_deref(),
        afp.as_deref(),
        ccf.as_deref(),
        fondo_cesantias.as_deref(),
    )
    .map_err(|e| format!("Error al crear empleado: {}", e))
}

#[tauri::command]
pub fn list_employees(state: State<AppState>) -> Result<Vec<crate::payroll::Employee>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::payroll::list_employees(&conn).map_err(|e| format!("Error al listar empleados: {}", e))
}

#[tauri::command]
pub fn update_employee(
    state: State<AppState>,
    id: i64,
    name: String,
    doc_type: Option<String>,
    doc_number: Option<String>,
    position: Option<String>,
    base_salary: String,
    transport_allowance: bool,
    has_social_security: bool,
    payment_frequency: Option<String>,
    risk_level: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    city: Option<String>,
    department: Option<String>,
    address: Option<String>,
    hire_date: Option<String>,
    eps: Option<String>,
    arl: Option<String>,
    afp: Option<String>,
    ccf: Option<String>,
    fondo_cesantias: Option<String>,
    active: bool,
) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let base_salary = parse_f64(&base_salary, "salario base")?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let e = crate::payroll::Employee {
        id,
        name,
        doc_type,
        doc_number,
        position,
        base_salary,
        transport_allowance,
        has_social_security,
        payment_frequency: payment_frequency.unwrap_or_else(|| "Mensual".to_string()),
        risk_level: risk_level.unwrap_or_else(|| "I".to_string()),
        phone,
        email,
        city,
        department,
        address,
        hire_date,
        eps,
        arl,
        afp,
        ccf,
        fondo_cesantias: fondo_cesantias,
        active,
    };
    crate::payroll::update_employee(&conn, &e).map_err(|e| format!("Error al actualizar empleado: {}", e))
}

#[tauri::command]
pub fn delete_employee(state: State<AppState>, id: i64) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::payroll::delete_employee(&conn, id).map_err(|e| format!("Error al eliminar empleado: {}", e))
}