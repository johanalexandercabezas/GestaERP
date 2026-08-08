use crate::rate_limiter::LOGIN_RATE_LIMITER;
use crate::AppState;
use crate::LoginResponse;
use crate::UserInfo;
use tauri::State;

#[tauri::command]
pub fn login(
    state: State<AppState>,
    username: String,
    password: String,
) -> Result<LoginResponse, String> {
    // Validar username (OWASP: Input Validation)
    let username_clean = crate::validation::validate_username(&username)?;
    crate::validation::validate_password(&password)?;

    if password.len() > 128 {
        return Err("La contraseña no puede exceder los 128 caracteres".to_string());
    }

    // Rate limiting: prevenir fuerza bruta (OWASP: A07:2021)
    let rate_key = format!("login:{}", username_clean);
    if let Err(e) = LOGIN_RATE_LIMITER.check(&rate_key) {
        log::warn!(
            "[SECURITY] Rate limit excedido para usuario: {}",
            username_clean
        );
        return Ok(LoginResponse {
            success: false,
            user: None,
            message: e,
        });
    }

    // CORRECCIÓN: Unificar el tipo de retorno del bloque a Result<UserInfo, String>
    let user_info = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        match crate::db::verify_password(&conn, &username_clean, &password) {
            Ok(true) => crate::db::get_user_info(&conn, &username_clean)
                .ok_or("Usuario no encontrado".to_string())
                .map(|(id, full_name, role)| UserInfo {
                    id,
                    full_name: full_name.clone(),
                    role: role.clone(),
                }),
            Ok(false) => {
                log::warn!(
                    "[SECURITY] Intento de login fallido para: {}",
                    username_clean
                );
                Err("Usuario o contraseña incorrectos".to_string())
            }
            Err(e) => Err(format!("Error: {}", e)),
        }
    }; // El lock de la BD se libera aquí

    match user_info {
        Ok(user) => {
            // Login exitoso: resetear rate limiter
            LOGIN_RATE_LIMITER.reset(&rate_key);
            let mut current = state.current_user.lock().map_err(|e| e.to_string())?;
            let full_name = user.full_name.clone();
            *current = Some(user.clone());
            log::info!(
                "[AUTH] Login exitoso: {} (rol: {})",
                username_clean,
                user.role
            );
            Ok(LoginResponse {
                success: true,
                user: Some(user),
                message: format!("Bienvenido, {}", full_name),
            })
        }
        Err(msg) => Ok(LoginResponse {
            success: false,
            user: None,
            message: msg,
        }),
    }
}

#[tauri::command]
pub fn get_current_user(state: State<AppState>) -> Result<Option<UserInfo>, String> {
    let current = state.current_user.lock().map_err(|e| e.to_string())?;
    Ok(current.clone())
}

#[tauri::command]
pub fn logout(state: State<AppState>) -> Result<(), String> {
    let mut current = state.current_user.lock().map_err(|e| e.to_string())?;
    *current = None;
    Ok(())
}
