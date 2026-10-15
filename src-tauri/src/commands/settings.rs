use crate::auth_guard;
use crate::AppState;
use tauri::State;
use zeroize::Zeroizing;

#[tauri::command]
pub fn get_database_security_state(
    state: State<AppState>,
) -> Result<crate::db::DatabaseSecurityState, String> {
    if state.db.is_initialized()? {
        return Ok(crate::db::DatabaseSecurityState {
            status: "ready".to_string(),
            recovery_phrase_required: false,
        });
    }
    crate::db::database_security_state()
}

#[tauri::command]
pub fn list_recovery_backups(
    state: State<AppState>,
) -> Result<crate::backup::RecoveryBackupCatalog, String> {
    if state.db.is_initialized()? {
        return Err(
            "La base ya está inicializada; no se necesita recuperar un backup.".to_string(),
        );
    }
    let security_state = crate::db::database_security_state()?;
    if security_state.status != "new_database" {
        return Err(
            "Los backups solo se pueden descubrir durante la configuración de una base nueva."
                .to_string(),
        );
    }
    crate::backup::recovery_backup_catalog()
}

#[tauri::command]
pub fn initialize_database_security(
    state: State<AppState>,
    recovery_phrase: String,
) -> Result<(), String> {
    let recovery_phrase = Zeroizing::new(recovery_phrase);
    let connection = crate::db::secure_database(recovery_phrase.as_str())?;
    state.db.initialize(connection)
}

#[tauri::command]
pub fn recover_database_key(
    state: State<AppState>,
    recovery_phrase: String,
    backup_filename: Option<String>,
) -> Result<(), String> {
    let recovery_phrase = Zeroizing::new(recovery_phrase);
    let connection =
        crate::db::recover_database(recovery_phrase.as_str(), backup_filename.as_deref())?;
    state.db.initialize(connection)
}

#[tauri::command]
pub fn configure_backup_sync(
    state: State<AppState>,
    endpoint: String,
    token: String,
) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let endpoint = endpoint.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(endpoint)
        .map_err(|e| format!("La URL del servicio de backup no es válida: {e}"))?;
    let local_http = parsed.scheme() == "http"
        && parsed
            .host_str()
            .map(|host| matches!(host, "localhost" | "127.0.0.1" | "::1"))
            .unwrap_or(false);
    if (parsed.scheme() != "https" && !local_http)
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(
            "El endpoint debe usar HTTPS (HTTP solo en localhost) y no puede incluir credenciales, consulta ni fragmento.".to_string(),
        );
    }
    let token = Zeroizing::new(token);
    if token.trim().len() < 16 {
        return Err("El token de acceso debe contener al menos 16 caracteres.".to_string());
    }
    crate::db::store_backup_sync_token(token.trim())?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "backup_sync_endpoint", endpoint)
        .map_err(|e| format!("No se pudo guardar el endpoint de sincronización: {e}"))
}

#[tauri::command]
pub fn is_setup_complete(state: State<AppState>) -> Result<bool, String> {
    // Pública: se consulta antes de que exista sesión (flujo de primer arranque)
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let nombre = crate::db::get_setting(&conn, "nombre_negocio");
    let nit = crate::db::get_setting(&conn, "nit");
    let has_admin = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin' AND active = 1)",
            [],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|error| format!("No se pudo comprobar el administrador inicial: {error}"))?;
    Ok(nombre.is_some() && nit.is_some() && has_admin)
}

#[tauri::command]
pub fn save_business_info(
    state: State<AppState>,
    nombre: String,
    nit: String,
    iva: bool,
    telefono: String,
    direccion: String,
    ciudad: String,
    email: String,
) -> Result<(), String> {
    // Permitir sin sesión solo si el setup aún no está completo (primer arranque);
    // en cualquier otro caso se requiere admin.
    let setup_done = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin' AND active = 1)",
            [],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|error| format!("No se pudo verificar el estado de configuración: {error}"))?
    };
    if setup_done {
        auth_guard::require_admin(&state)?;
    }
    let nit = nit.trim();
    let telefono = telefono.trim();
    crate::validation::validate_nit_digits(nit, true)?;
    crate::validation::validate_phone_digits(telefono, true)?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "nombre_negocio", &nombre).map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "nit", &nit).map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "iva_responsable", if iva { "1" } else { "0" })
        .map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "telefono", &telefono).map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "direccion", &direccion).map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "ciudad", &ciudad).map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "email", &email).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, String> {
    // Las siguientes claves son públicas (se leen antes del login para mostrar
    // en la UI de login/setup). Cualquier otra clave requiere autenticación.
    const PUBLIC_KEYS: &[&str] = &[
        "nombre_negocio",
        "nit",
        "telefono",
        "direccion",
        "ciudad",
        "email",
        "logo_path",
        "iva_responsable",
        "department",
        "license_plan",
    ];
    if !PUBLIC_KEYS.iter().any(|p| key == *p) {
        auth_guard::require_auth(&state)?;
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    Ok(crate::db::get_setting(&conn, &key))
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    // Defensivo: nunca permitir reescribir claves internas de licencia/plan
    // desde el frontend, aunque el rol sea admin. Estas claves se gestionan
    // exclusivamente vía el flujo de activación de licencias firmadas.
    const PROTECTED_KEYS: &[&str] = &["license_plan", "license_key", "license_signature"];
    if PROTECTED_KEYS.iter().any(|p| key.eq_ignore_ascii_case(p)) {
        return Err("Clave de configuración protegida".to_string());
    }
    if key.eq_ignore_ascii_case("nit") {
        crate::validation::validate_nit_digits(&value, false)?;
    }
    if key.eq_ignore_ascii_case("phone") || key.eq_ignore_ascii_case("telefono") {
        crate::validation::validate_phone_digits(&value, false)?;
    }
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

/// Sube el logo del negocio: recibe bytes de imagen, redimensiona, guarda en disco y persiste ruta en DB
#[tauri::command]
pub fn upload_business_logo(state: State<AppState>, logo_bytes: Vec<u8>) -> Result<String, String> {
    let has_admin = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin' AND active = 1)",
            [],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|error| format!("No se pudo verificar el estado de configuración: {error}"))?
    };
    if has_admin {
        auth_guard::require_admin(&state)?;
    }
    use image::imageops::FilterType;
    use image::ImageFormat;
    use std::io::Cursor;

    // Validar tamaño máximo (5MB)
    if logo_bytes.len() > 5 * 1024 * 1024 {
        return Err("La imagen supera el tamaño máximo de 5MB".into());
    }

    // Decodificar la imagen desde los bytes
    let img = image::load_from_memory(&logo_bytes)
        .map_err(|e| format!("Error al decodificar la imagen: {}", e))?;

    // Redimensionar a máximo 200x200 manteniendo relación de aspecto
    let resized = img.resize(200, 200, FilterType::Lanczos3);

    // Crear directorio de assets
    let data_dir = dirs::data_dir().ok_or("No se encontró el directorio de datos del sistema")?;
    let assets_dir = data_dir.join("GestaERP").join("assets");
    std::fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Error al crear carpeta de assets: {}", e))?;

    // Guardar como PNG optimizado
    let logo_path = assets_dir.join("logo.png");
    let mut buffer = Cursor::new(Vec::new());
    resized
        .write_to(&mut buffer, ImageFormat::Png)
        .map_err(|e| format!("Error al codificar imagen PNG: {}", e))?;

    // Optimizar: re-cargar y guardar con compresión si es muy grande
    let final_bytes = buffer.into_inner();
    if final_bytes.len() > 500 * 1024 {
        // Si supera 500KB, re-comprimir con calidad reducida
        let img_optimized = image::load_from_memory(&final_bytes)
            .map_err(|e| format!("Error al recargar: {}", e))?;
        let mut opt_buffer = Cursor::new(Vec::new());
        img_optimized
            .write_to(&mut opt_buffer, ImageFormat::Png)
            .map_err(|e| format!("Error al codificar PNG optimizado: {}", e))?;
        std::fs::write(&logo_path, opt_buffer.into_inner())
            .map_err(|e| format!("Error al guardar logo optimizado: {}", e))?;
    } else {
        std::fs::write(&logo_path, &final_bytes)
            .map_err(|e| format!("Error al guardar logo: {}", e))?;
    }

    // Guardar ruta en DB
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "logo_path", "logo.png")
        .map_err(|e| format!("Error al guardar ruta del logo: {}", e))?;

    Ok("Logo guardado exitosamente".to_string())
}

/// Obtiene el logo del negocio en Base64 para mostrar en el frontend
/// Pública: se usa en la pantalla de login/setup (antes de sesión)
#[tauri::command]
pub fn get_business_logo(state: State<AppState>) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let logo_filename = crate::db::get_setting(&conn, "logo_path");

    if let Some(filename) = logo_filename {
        // AUD-011 FIX: Validar que el nombre de archivo no contenga separadores de path
        // ni secuencias de escape (path traversal). Solo se permiten nombres planos.
        let basename = std::path::Path::new(&filename)
            .file_name()
            .and_then(|n| n.to_str())
            .filter(|n| {
                !n.is_empty() && !n.contains('/') && !n.contains('\\') && !n.contains("..")
            });

        if let Some(safe_name) = basename {
            let data_dir =
                dirs::data_dir().ok_or("No se encontró el directorio de datos del sistema")?;
            let logo_path = data_dir.join("GestaERP").join("assets").join(safe_name);

            if logo_path.exists() {
                let bytes =
                    std::fs::read(&logo_path).map_err(|e| format!("Error al leer logo: {}", e))?;
                let base64 = base64_encode(&bytes);
                return Ok(Some(base64));
            }
        }
    }

    // Fallback: buscar logo.png directamente
    let data_dir = dirs::data_dir().ok_or("No se encontró el directorio de datos del sistema")?;
    let logo_path = data_dir.join("GestaERP").join("assets").join("logo.png");
    if logo_path.exists() {
        let bytes = std::fs::read(&logo_path).map_err(|e| format!("Error al leer logo: {}", e))?;
        let base64 = base64_encode(&bytes);
        return Ok(Some(base64));
    }

    Ok(None)
}

#[tauri::command]
pub fn reset_database(state: State<AppState>) -> Result<String, String> {
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute_batch("
        DROP TABLE IF EXISTS sales;
        DROP TABLE IF EXISTS sale_items;
        DROP TABLE IF EXISTS purchases;
        DROP TABLE IF EXISTS purchase_items;
        DROP TABLE IF EXISTS expenses;
        DROP TABLE IF EXISTS receivables;
        DROP TABLE IF EXISTS receivable_payments;
        DROP TABLE IF EXISTS inventory_movements;
        DROP TABLE IF EXISTS payroll_entries;
        DROP TABLE IF EXISTS physical_counts;
        DROP TABLE IF EXISTS physical_count_items;
        DROP TABLE IF EXISTS calendar_notes;
        DROP TABLE IF EXISTS notifications;
        DROP TABLE IF EXISTS cash_registers;
        DELETE FROM products;
        DELETE FROM customers;
        DELETE FROM suppliers;
        DELETE FROM employees;
        DELETE FROM settings WHERE key != 'nombre_negocio' AND key != 'nit' AND key != 'iva_responsable' AND key != 'telefono' AND key != 'direccion' AND key != 'ciudad' AND key != 'email' AND key != 'logo_path' AND key != 'department' AND key != 'license_plan';
        -- AUD-010 FIX: Conserva el primer admin (por min id) y elimina el resto de usuarios
        -- en lugar de hardcodear username='admin'
        DELETE FROM users WHERE role != 'admin' OR id NOT IN (SELECT MIN(id) FROM users WHERE role = 'admin');
        -- AUD-010 FIX: Repoblar schema_migrations con la versión actual para evitar
        -- estado inconsistente. La app reiniciará y re-ejecutará migraciones.
        -- NOTA: las tablas DROPeadas se recrearán al reiniciar la app en init_db().
        DELETE FROM licenses;
        VACUUM;
    ").map_err(|e| format!("Error al limpiar base de datos: {}", e))?;
    // Re-inicializar schema_migrations con la versión actual (7)
    conn.execute("INSERT INTO schema_migrations (version) VALUES (7)", [])
        .ok(); // No fatal si falla (la BD ya está limpia y el reinicio lo arreglará)
    Ok("Base de datos limpiada exitosamente. Se han eliminado todas las ventas, compras, gastos y movimientos. Se conserva el primer usuario administrador y la configuración del negocio.".to_string())
}

#[tauri::command]
pub fn get_desktop_path(state: State<AppState>) -> Result<String, String> {
    // P1-03 FIX: Requiere sesión para no exponer rutas del sistema a IPC sin autenticar
    auth_guard::require_auth(&state)?;
    let home = dirs::home_dir().ok_or("No se encontró el directorio home")?;
    let desktop = home.join("Desktop");
    if !desktop.exists() {
        let desktop = home.join("Escritorio");
        if !desktop.exists() {
            return Ok(home.to_string_lossy().to_string());
        }
        return Ok(desktop.to_string_lossy().to_string());
    }
    Ok(desktop.to_string_lossy().to_string())
}

/// Codificación base64 simple sin dependencias externas
fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((n >> 18) & 0x3f) as usize] as char);
        result.push(CHARS[((n >> 12) & 0x3f) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((n >> 6) & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(n & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}
