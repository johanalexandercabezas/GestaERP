use crate::auth_guard;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn create_bootstrap_admin(
    state: State<AppState>,
    username: String,
    password: String,
    full_name: String,
    recovery_answers: Vec<crate::users::RecoveryAnswerInput>,
) -> Result<bool, String> {
    let username_clean = crate::validation::validate_username(&username)?;
    crate::validation::validate_password(&password)?;
    let recovery_answers = crate::users::validate_recovery_answers(&recovery_answers)?;
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

    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let user_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .map_err(|error| format!("No se pudo verificar el administrador inicial: {error}"))?;
    if user_count > 0 {
        return Ok(false);
    }

    let transaction = conn
        .transaction()
        .map_err(|error| format!("No se pudo iniciar la creación del administrador: {error}"))?;
    let req = crate::users::CreateUserRequest {
        username: username_clean,
        password,
        full_name: full_name_clean.to_string(),
        role: "admin".to_string(),
    };
    let user_id = crate::users::create_user(&transaction, &req)
        .map_err(|e| format!("Error al crear el primer administrador: {}", e))?;
    crate::users::store_recovery_answers(&transaction, user_id, &recovery_answers).map_err(
        |error| format!("No se pudieron guardar las respuestas de recuperación: {error}"),
    )?;
    transaction
        .commit()
        .map_err(|error| format!("No se pudo confirmar la creación del administrador: {error}"))?;
    Ok(true)
}

#[tauri::command]
pub fn get_recovery_setup_questions() -> Vec<crate::users::RecoveryQuestion> {
    crate::users::recovery_setup_questions()
}

#[tauri::command]
pub fn configure_admin_recovery_answers(
    state: State<AppState>,
    current_password: String,
    recovery_answers: Vec<crate::users::RecoveryAnswerInput>,
) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let current_user = auth_guard::current_user(&state)?;
    let recovery_answers = crate::users::validate_recovery_answers(&recovery_answers)?;
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    let username = conn
        .query_row(
            "SELECT username FROM users WHERE id = ?1 AND role = 'admin' AND active = 1",
            [current_user.id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| format!("No se pudo identificar la cuenta administradora: {error}"))?;
    if !crate::db::verify_password(&conn, &username, &current_password)? {
        return Err("La contraseña actual no es correcta.".to_string());
    }

    let transaction = conn
        .transaction()
        .map_err(|error| format!("No se pudo iniciar la actualización de recuperación: {error}"))?;
    transaction
        .execute(
            "DELETE FROM password_recovery_answers WHERE user_id = ?1",
            [current_user.id],
        )
        .map_err(|error| format!("No se pudieron reemplazar las preguntas anteriores: {error}"))?;
    crate::users::store_recovery_answers(&transaction, current_user.id, &recovery_answers)
        .map_err(|error| format!("No se pudieron guardar las respuestas nuevas: {error}"))?;
    transaction
        .execute(
            "DELETE FROM password_recovery_attempts WHERE user_id = ?1",
            [current_user.id],
        )
        .map_err(|error| format!("No se pudo limpiar el historial de recuperación: {error}"))?;
    transaction.commit().map_err(|error| {
        format!("No se pudo confirmar la actualización de recuperación: {error}")
    })?;
    crate::rate_limiter::PASSWORD_RECOVERY_RATE_LIMITER
        .reset(&format!("password-recovery:{username}"));
    Ok(())
}

#[tauri::command]
pub fn get_admin_recovery_questions(
    state: State<AppState>,
    username: String,
) -> Result<Vec<crate::users::RecoveryQuestion>, String> {
    if state
        .current_user
        .lock()
        .map_err(|error| error.to_string())?
        .is_some()
    {
        return Err("Cierra la sesión antes de iniciar la recuperación.".to_string());
    }
    let username = crate::validation::validate_username(&username)?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let questions = crate::users::recovery_questions_for_user(&conn, &username)
        .map_err(|error| format!("No se pudo consultar la recuperación: {error}"))?;
    if questions.len() != 3 {
        return Err("No se pudo iniciar la recuperación. Verifica el usuario y que tenga este método configurado.".to_string());
    }
    Ok(questions)
}

#[tauri::command]
pub fn reset_admin_password(
    state: State<AppState>,
    username: String,
    recovery_answers: Vec<crate::users::RecoveryAnswerInput>,
    new_password: String,
) -> Result<(), String> {
    if state
        .current_user
        .lock()
        .map_err(|error| error.to_string())?
        .is_some()
    {
        return Err("Cierra la sesión antes de iniciar la recuperación.".to_string());
    }
    let username = crate::validation::validate_username(&username)?;
    crate::validation::validate_password(&new_password)?;
    let recovery_answers = crate::users::validate_recovery_answers(&recovery_answers)?;
    let rate_key = format!("password-recovery:{username}");
    crate::rate_limiter::PASSWORD_RECOVERY_RATE_LIMITER.check(&rate_key)?;

    let conn = state.db.lock().map_err(|error| error.to_string())?;
    use rusqlite::OptionalExtension;
    let user_id = conn
        .query_row(
            "SELECT id FROM users WHERE username = ?1 AND role = 'admin' AND active = 1",
            [&username],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|error| format!("No se pudo consultar la cuenta: {error}"))?;
    let Some(user_id) = user_id else {
        return Err("No se pudo verificar la cuenta o las respuestas de recuperación.".to_string());
    };
    crate::users::check_recovery_lockout(&conn, user_id)?;
    if !crate::users::verify_recovery_answers(&conn, user_id, &recovery_answers)? {
        crate::users::record_recovery_failure(&conn, user_id)?;
        return Err("No se pudo verificar la cuenta o las respuestas de recuperación.".to_string());
    }

    let password_hash = crate::users::hash_password(&new_password)?;
    let transaction = conn
        .unchecked_transaction()
        .map_err(|error| format!("No se pudo iniciar el restablecimiento: {error}"))?;
    let updated = transaction
        .execute(
            "UPDATE users SET password = ?1 WHERE id = ?2 AND role = 'admin' AND active = 1",
            rusqlite::params![password_hash, user_id],
        )
        .map_err(|error| format!("No se pudo actualizar la contraseña: {error}"))?;
    if updated != 1 {
        return Err("No se pudo actualizar la contraseña del administrador.".to_string());
    }
    transaction
        .execute(
            "DELETE FROM password_recovery_attempts WHERE user_id = ?1",
            [user_id],
        )
        .map_err(|error| format!("No se pudo limpiar el historial de recuperación: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("No se pudo confirmar la contraseña nueva: {error}"))?;
    crate::rate_limiter::PASSWORD_RECOVERY_RATE_LIMITER.reset(&rate_key);
    Ok(())
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
