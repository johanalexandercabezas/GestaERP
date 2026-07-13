//! Middleware de autorización centralizado (C4).
//!
//! Todos los comandos Tauri sensibles deben llamar a una de estas funciones
//! al inicio de su cuerpo para verificar la identidad y el rol del usuario
//! autenticado. El frontend oculta el menú según el rol, pero el backend es
//! la única fuente de verdad: desde DevTools/IPC cualquier cliente puede
//! invocar `invoke(...)`, por lo que sin estos guards un cajero (o alguien
//! sin sesión) podría ejecutar acciones administrativas.
//!
//! Los locks del `Mutex` se toman y se sueltan dentro de cada función, así
//! que es seguro combinarlos con un posterior `state.current_user.lock()`
//! o `state.db.lock()` dentro del mismo comando (locks secuenciales, no
//! anidados).

use tauri::State;
use crate::AppState;

/// Verifica que exista un usuario autenticado en la sesión actual.
/// Úsalo en comandos accesibles para cualquier usuario logueado (lectura general).
pub fn require_auth(state: &State<AppState>) -> Result<(), String> {
    let current = state.current_user.lock().map_err(|e| e.to_string())?;
    if current.is_none() {
        return Err("No autorizado: debe iniciar sesión".to_string());
    }
    Ok(())
}

/// Verifica que el usuario autenticado tenga rol `admin`.
/// Úsalo en comandos administrativos (gestión de usuarios, configuración,
/// reseteo de BD, gestión de productos/proveedores/empleados, nómina, etc.).
pub fn require_admin(state: &State<AppState>) -> Result<(), String> {
    let current = state.current_user.lock().map_err(|e| e.to_string())?;
    match current.as_ref() {
        Some(u) if u.role == "admin" => Ok(()),
        Some(_) => Err("No autorizado: se requieren privilegios de administrador".to_string()),
        None => Err("No autorizado: debe iniciar sesión".to_string()),
    }
}

/// Devuelve el identificador del usuario autenticado.
/// Equivalente a `require_auth` seguido de la lectura del id, evitando el IDOR
/// de confiar en un `user_id` enviado desde el frontend.
pub fn current_user_id(state: &State<AppState>) -> Result<i64, String> {
    let current = state.current_user.lock().map_err(|e| e.to_string())?;
    current
        .as_ref()
        .map(|u| u.id)
        .ok_or_else(|| "No hay usuario autenticado".to_string())
}

/// Devuelve el usuario autenticado completo (id, full_name, role).
/// Útil para logs de auditoría y operaciones que requieran nombre+id.
pub fn current_user(state: &State<AppState>) -> Result<crate::UserInfo, String> {
    let current = state.current_user.lock().map_err(|e| e.to_string())?;
    current
        .as_ref()
        .cloned()
        .ok_or_else(|| "No hay usuario autenticado".to_string())
}
