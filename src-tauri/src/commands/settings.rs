use tauri::State;
use crate::AppState;
use crate::auth_guard;

#[tauri::command]
pub fn is_setup_complete(state: State<AppState>) -> Result<bool, String> {
    // Pública: se consulta antes de que exista sesión (flujo de primer arranque)
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let nombre = crate::db::get_setting(&conn, "nombre_negocio");
    let nit = crate::db::get_setting(&conn, "nit");
    Ok(nombre.is_some() && nit.is_some())
}

#[tauri::command]
pub fn save_business_info(state: State<AppState>, nombre: String, nit: String, iva: bool, telefono: String, direccion: String, ciudad: String, email: String) -> Result<(), String> {
    // Permitir sin sesión solo si el setup aún no está completo (primer arranque);
    // en cualquier otro caso se requiere admin.
    let setup_done = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        crate::db::get_setting(&conn, "nombre_negocio").is_some()
    };
    if setup_done {
        auth_guard::require_admin(&state)?;
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "nombre_negocio", &nombre).map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "nit", &nit).map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "iva_responsable", if iva { "1" } else { "0" }).map_err(|e| e.to_string())?;
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
        "nombre_negocio", "nit", "telefono", "direccion", "ciudad",
        "email", "logo_path", "iva_responsable", "department", "license_plan",
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
    auth_guard::require_admin(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

/// Sube el logo del negocio: recibe bytes de imagen, redimensiona, guarda en disco y persiste ruta en DB
#[tauri::command]
pub fn upload_business_logo(state: State<AppState>, logo_bytes: Vec<u8>) -> Result<String, String> {
    auth_guard::require_admin(&state)?;
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
    let data_dir = dirs::data_dir()
        .ok_or("No se encontró el directorio de datos del sistema")?;
    let assets_dir = data_dir.join("GestaERP").join("assets");
    std::fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Error al crear carpeta de assets: {}", e))?;

    // Guardar como PNG optimizado
    let logo_path = assets_dir.join("logo.png");
    let mut buffer = Cursor::new(Vec::new());
    resized.write_to(&mut buffer, ImageFormat::Png)
        .map_err(|e| format!("Error al codificar imagen PNG: {}", e))?;

    // Optimizar: re-cargar y guardar con compresión si es muy grande
    let final_bytes = buffer.into_inner();
    if final_bytes.len() > 500 * 1024 {
        // Si supera 500KB, re-comprimir con calidad reducida
        let img_optimized = image::load_from_memory(&final_bytes)
            .map_err(|e| format!("Error al recargar: {}", e))?;
        let mut opt_buffer = Cursor::new(Vec::new());
        img_optimized.write_to(&mut opt_buffer, ImageFormat::Png)
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
        let data_dir = dirs::data_dir()
            .ok_or("No se encontró el directorio de datos del sistema")?;
        let logo_path = data_dir.join("GestaERP").join("assets").join(&filename);

        if logo_path.exists() {
            let bytes = std::fs::read(&logo_path)
                .map_err(|e| format!("Error al leer logo: {}", e))?;
            let base64 = base64_encode(&bytes);
            return Ok(Some(base64));
        }
    }
    
    // Fallback: buscar logo.png directamente
    let data_dir = dirs::data_dir()
        .ok_or("No se encontró el directorio de datos del sistema")?;
    let logo_path = data_dir.join("GestaERP").join("assets").join("logo.png");
    if logo_path.exists() {
        let bytes = std::fs::read(&logo_path)
            .map_err(|e| format!("Error al leer logo: {}", e))?;
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
        DELETE FROM schema_migrations;
        DELETE FROM licenses;
        DELETE FROM users WHERE username != 'admin';
        VACUUM;
    ").map_err(|e| format!("Error al limpiar base de datos: {}", e))?;
    Ok("Base de datos limpiada exitosamente. Se han eliminado todas las ventas, compras, gastos y movimientos. Los servicios, productos y servicios creados permanecen.".to_string())
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
