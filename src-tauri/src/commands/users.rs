use crate::auth_guard;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn create_bootstrap_admin(
    state: State<AppState>,
    username: String,
    password: String,
    full_name: String,
) -> Result<bool, String> {
    let username_clean = crate::validation::validate_username(&username)?;
    crate::validation::validate_password(&password)?;
    let full_name_clean = full_name.trim();
    if full_name_clean.is_empty() {
        return Err("El nombre completo es obligatorio".to_string());
    }
    if password.len() < 8
        || !password.chars().any(|c| c.is_uppercase())
        || !password.chars().any(|c| c.is_lowercase())
        || !password.chars().any(|c| c.is_numeric())
    {
        return Err("La contraseña debe tener al menos 8 caracteres, incluir mayúsculas, minúsculas y números".to_string());
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let user_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .unwrap_or(0);
    if user_count > 0 {
        return Ok(false);
    }

    let req = crate::users::CreateUserRequest {
        username: username_clean,
        password,
        full_name: full_name_clean.to_string(),
        role: "admin".to_string(),
    };
    crate::users::create_user(&conn, &req)
        .map_err(|e| format!("Error al crear el primer administrador: {}", e))?;
    Ok(true)
}

#[tauri::command]
pub fn create_user(
    state: State<AppState>,
    username: String,
    password: String,
    full_name: String,
    role: String,
) -> Result<i64, String> {
    auth_guard::require_admin(&state)?;
    // AUD-006 FIX: unificar roles válidos (mismo conjunto que update_user)
    if !matches!(
        role.as_str(),
        "admin" | "subadmin" | "vendedor" | "asistente" | "cashier"
    ) {
        return Err("Rol inválido".to_string());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let max_users = conn
        .query_row(
            "SELECT max_users FROM licenses WHERE active = 1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(1);
    let current_users: i64 = conn
        .query_row("SELECT COUNT(*) FROM users WHERE active = 1", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);
    if current_users >= max_users {
        return Err("Límite de usuarios alcanzado para su plan".to_string());
    }
    let req = crate::users::CreateUserRequest {
        username,
        password,
        full_name,
        role,
    };
    crate::users::create_user(&conn, &req).map_err(|e| format!("Error al crear usuario: {}", e))
}

#[tauri::command]
pub fn list_users(state: State<AppState>) -> Result<Vec<crate::users::UserRecord>, String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::users::list_users(&conn).map_err(|e| format!("Error al listar usuarios: {}", e))
}

#[tauri::command]
pub fn update_user(
    state: State<AppState>,
    id: i64,
    full_name: String,
    role: String,
    active: bool,
    new_password: Option<String>,
) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    // AUD-006 FIX: unificar roles válidos con create_user (admin|subadmin|vendedor|asistente|cashier)
    if !matches!(
        role.as_str(),
        "admin" | "subadmin" | "vendedor" | "asistente" | "cashier"
    ) {
        return Err(
            "Rol inválido. Roles válidos: admin, subadmin, vendedor, asistente, cashier"
                .to_string(),
        );
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let req = crate::users::UpdateUserRequest {
        id,
        full_name,
        role,
        active,
        new_password,
    };
    crate::users::update_user(&conn, &req)
        .map_err(|e| format!("Error al actualizar usuario: {}", e))
}

#[tauri::command]
pub fn delete_user(state: State<AppState>, id: i64) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    crate::users::delete_user(&conn, id).map_err(|e| format!("Error al eliminar usuario: {}", e))
}

/// Comando público (se usa antes del login) — verifica si ya existe algún usuario.
#[tauri::command]
pub fn has_any_user(state: State<AppState>) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .unwrap_or(0);
    Ok(count > 0)
}
