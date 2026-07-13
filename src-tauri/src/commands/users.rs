use tauri::State;
use crate::AppState;
use crate::auth_guard;

#[tauri::command]
pub fn create_user(state: State<AppState>, username: String, password: String, full_name: String, role: String) -> Result<i64, String> {
    auth_guard::require_admin(&state)?;
    // Defensivo: impedir que el frontend fuerce un rol distinto de los válidos
    if !matches!(role.as_str(), "admin" | "cashier") {
        return Err("Rol inválido".to_string());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let max_users = conn.query_row("SELECT max_users FROM licenses WHERE active = 1", [], |row| row.get::<_, i64>(0)).unwrap_or(1);
    let current_users: i64 = conn.query_row("SELECT COUNT(*) FROM users WHERE active = 1", [], |row| row.get(0)).unwrap_or(0);
    if current_users >= max_users { return Err("Límite de usuarios alcanzado para su plan".to_string()); }
    let req = crate::users::CreateUserRequest { username, password, full_name, role };
    crate::users::create_user(&conn, &req).map_err(|e| format!("Error al crear usuario: {}", e))
}

#[tauri::command]
pub fn list_users(state: State<AppState>) -> Result<Vec<crate::users::UserRecord>, String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::users::list_users(&conn).map_err(|e| format!("Error al listar usuarios: {}", e))
}

#[tauri::command]
pub fn update_user(state: State<AppState>, id: i64, full_name: String, role: String, active: bool, new_password: Option<String>) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    if !matches!(role.as_str(), "admin" | "cashier") {
        return Err("Rol inválido".to_string());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let req = crate::users::UpdateUserRequest { id, full_name, role, active, new_password };
    crate::users::update_user(&conn, &req).map_err(|e| format!("Error al actualizar usuario: {}", e))
}

#[tauri::command]
pub fn delete_user(state: State<AppState>, id: i64) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::users::delete_user(&conn, id).map_err(|e| format!("Error al eliminar usuario: {}", e))
}