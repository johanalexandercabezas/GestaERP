use crate::rate_limiter::RateLimiter;
use crate::AppState;
use tauri::State;

/// Rate limiter para activación de licencias (previene fuerza bruta del HMAC).
/// 3 intentos en 10 minutos → bloqueo de 30 minutos.
static LICENSE_RATE_LIMITER: std::sync::LazyLock<RateLimiter> =
    std::sync::LazyLock::new(|| RateLimiter::new(3, 600, 1800));

// NOTA DE SEGURIDAD (P0-03 FIX):
// Estos comandos son PÚBLICOS por diseño. El flujo de licencia es el GATE 1 de la app
// y se ejecuta ANTES de que exista un usuario autenticado o un admin creado.
// La validación de seguridad se delega a la firma HMAC-SHA256 de la clave de licencia.
// Un atacante no puede "activar" una licencia sin una clave firmada con GESTAERP_SECRET_KEY.
// Para generar claves se necesita el keygen interno (no distribuido a clientes).
// AUD-003 FIX: rate limiting adicional para evitar fuerza bruta sobre el HMAC truncado.

#[tauri::command]
pub fn activate_license(
    state: State<AppState>,
    key: String,
    plan: String,
) -> Result<crate::license::LicenseInfo, String> {
    // AUD-003 FIX: Rate limiting para prevenir fuerza bruta de claves de licencia
    let rate_key = format!(
        "license:{}:{}",
        plan,
        key.chars().take(4).collect::<String>()
    );
    if let Err(e) = LICENSE_RATE_LIMITER.check(&rate_key) {
        log::warn!(
            "[SECURITY] Rate limit excedido en activación de licencia para plan: {}",
            plan
        );
        return Err(e);
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    match crate::license::activate_license(&conn, &key, &plan) {
        Ok(info) => {
            LICENSE_RATE_LIMITER.reset(&rate_key);
            Ok(info)
        }
        Err(e) => {
            log::warn!(
                "[SECURITY] Activación de licencia fallida para plan: {}",
                plan
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn activate_trial(state: State<AppState>) -> Result<crate::license::LicenseInfo, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::license::activate_trial(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_license_status(state: State<AppState>) -> Result<crate::license::LicenseInfo, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    Ok(crate::license::get_license_status(&conn))
}

// ──────────── Implementación (Códigos de Aceptación) ────────────
// PÚBLICOS por diseño: la pantalla de licencias (GATE 1) consulta el estado
// de implementación ANTES de que exista un usuario autenticado.

#[tauri::command]
pub fn generate_implementation_code(
    state: State<AppState>,
) -> Result<crate::implementation::ImplementationStatus, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::implementation::generate_implementation_code(&conn)
}

#[tauri::command]
pub fn validate_implementation_code(
    state: State<AppState>,
    code: String,
) -> Result<crate::implementation::ImplementationStatus, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::implementation::validate_implementation_code(&conn, &code)
}

#[tauri::command]
pub fn get_implementation_status(
    state: State<AppState>,
) -> Result<crate::implementation::ImplementationStatus, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    Ok(crate::implementation::get_implementation_status(&conn))
}

#[tauri::command]
pub fn is_implementation_paid(state: State<AppState>) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    Ok(crate::implementation::is_implementation_paid(&conn))
}
