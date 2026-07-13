use tauri::State;
use crate::AppState;
use crate::auth_guard;

#[tauri::command]
pub fn generate_payroll(
    state: State<AppState>,
    period: String,
    overtime_hours: Vec<(i64, f64, f64, f64, f64)>,
) -> Result<Vec<crate::payroll::PayrollEntry>, String> {
    auth_guard::require_admin(&state)?;
    eprintln!("[PAYROLL] Iniciando generación de nómina para {}", period);
    
    let db = state.db.lock().map_err(|e| {
        eprintln!("[PAYROLL] Error al bloquear BD: {}", e);
        e.to_string()
    })?;
    
    let result = crate::payroll::generate_payroll(&db, &period, &overtime_hours)
        .map_err(|e| {
            eprintln!("[PAYROLL] Error generando nómina: {}", e);
            format!("Error al generar nómina: {}", e)
        })?;
    
    drop(db); // Liberar Mutex explícitamente
    eprintln!("[PAYROLL] Nómina generada: {} empleados", result.len());
    
    Ok(result)
}

#[tauri::command]
pub fn get_payroll_history(
    state: State<AppState>,
    period: String,
) -> Result<Vec<crate::payroll::PayrollEntry>, String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::payroll::get_payroll_history(&conn, &period)
        .map_err(|e| format!("Error al obtener historial: {}", e))
}

#[tauri::command]
pub fn get_benefit_load(
    state: State<AppState>,
) -> Result<Vec<crate::payroll::BenefitLoad>, String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let employees = crate::payroll::list_employees(&conn).map_err(|e| e.to_string())?;
    Ok(crate::payroll::calculate_benefit_load(&employees))
}

#[tauri::command]
pub fn generate_payroll_report(state: State<AppState>, period: String) -> Result<Vec<String>, String> {
    auth_guard::require_admin(&state)?;
    eprintln!("[PAYROLL] Generando reporte PDF para {}", period);
    let conn = crate::db::open_database().map_err(|e| {
        eprintln!("[PAYROLL] Error al abrir BD para reporte: {}", e);
        e.to_string()
    })?;
    
    let entries = crate::payroll::get_payroll_history(&conn, &period)
        .map_err(|e| e.to_string())?;
    let employees = crate::payroll::list_employees(&conn)
        .map_err(|e| e.to_string())?;
    let benefits = crate::payroll::calculate_benefit_load(&employees);
    
    // CORRECCIÓN: Usar directorio seguro de Windows (AppData/GestaERP/reportes/nomina)
    let output_dir = dirs::data_dir()
        .ok_or("No se encontró directorio de datos del sistema")?
        .join("GestaERP")
        .join("reportes")
        .join("nomina");
    
    // Asegurar que la carpeta exista
    std::fs::create_dir_all(&output_dir).map_err(|e| format!("Error al crear carpeta de nómina: {}", e))?;
    
    let output_dir_str = output_dir.to_str().unwrap_or("./nomina");

    // Negocio: leer de settings (ya dentro de conn abierta)
    let business_name = crate::db::get_setting(&conn, "nombre_negocio").unwrap_or_else(|| "Mi Negocio".to_string());

    let result = crate::payroll_reports::generate_payroll_pdf(
        &period, &entries, &employees, &benefits, &business_name, output_dir_str
    );
    
    eprintln!("[PAYROLL] Reporte generado: {:?}", result);
    result
}