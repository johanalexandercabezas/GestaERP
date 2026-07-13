//! Validación y sanitización de entradas (OWASP Top 10: A01:2021 Broken Access Control)
//!
//! Todas las entradas de usuario deben pasar por estas funciones de validación
//! antes de ser procesadas por la capa de negocio o almacenadas en la base de datos.
//!
//! Principios aplicados:
//! - Defense in Depth: validar en la capa más externa (comandos Tauri)
//! - Least Privilege: rechazar por defecto, permitir solo lo conocido
//! - Input Validation: tipo + longitud + formato + rango

/// Valida que un string no esté vacío y no exceda la longitud máxima permitida.
/// Retorna el string limpio (trim) si es válido.
#[allow(dead_code)]
pub fn validate_required(value: &str, field_name: &str, max_len: usize) -> Result<String, String> {
    let cleaned = value.trim();
    if cleaned.is_empty() {
        return Err(format!("El campo '{}' es requerido", field_name));
    }
    if cleaned.len() > max_len {
        return Err(format!(
            "El campo '{}' excede la longitud máxima de {} caracteres",
            field_name, max_len
        ));
    }
    Ok(cleaned.to_string())
}

/// Valida que un string sea alfanumérico extendido (letras, números, espacios, guiones, underscore)
/// Útil para nombres de productos, proveedores, clientes, etc.
#[allow(dead_code)]
pub fn validate_name(value: &str, field_name: &str) -> Result<String, String> {
    let cleaned = validate_required(value, field_name, 200)?;
    // Permitir caracteres latinos, espacios, guiones, números
    if !cleaned
        .chars()
        .all(|c| c.is_alphanumeric() || c.is_whitespace() || c == '-' || c == '_' || c == '.' || c == '&' || c == '\'')
    {
        return Err(format!(
            "El campo '{}' contiene caracteres no permitidos",
            field_name
        ));
    }
    Ok(cleaned)
}

/// Valida un username: solo letras, números, underscore, entre 3 y 50 caracteres.
pub fn validate_username(value: &str) -> Result<String, String> {
    let cleaned = value.trim().to_lowercase();
    if cleaned.len() < 3 || cleaned.len() > 50 {
        return Err("El usuario debe tener entre 3 y 50 caracteres".to_string());
    }
    if !cleaned.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("El usuario solo puede contener letras, números y guiones bajos".to_string());
    }
    Ok(cleaned)
}

/// Valida una contraseña: mínimo 6 caracteres, máximo 128.
#[allow(dead_code)]
pub fn validate_password(value: &str) -> Result<(), String> {
    if value.len() < 6 {
        return Err("La contraseña debe tener al menos 6 caracteres".to_string());
    }
    if value.len() > 128 {
        return Err("La contraseña no puede exceder los 128 caracteres".to_string());
    }
    Ok(())
}

/// Valida un email (validación simple de formato).
#[allow(dead_code)]
pub fn validate_email(value: &str) -> Result<String, String> {
    let cleaned = value.trim().to_lowercase();
    if cleaned.is_empty() {
        return Ok(cleaned); // Email opcional
    }
    if !cleaned.contains('@') || cleaned.len() > 254 {
        return Err("El formato del email no es válido".to_string());
    }
    Ok(cleaned)
}

/// Valida un número de teléfono colombiano (formato simple).
#[allow(dead_code)]
pub fn validate_phone(value: &str) -> Result<String, String> {
    let cleaned: String = value.chars().filter(|c| c.is_digit(10) || *c == '+').collect();
    if cleaned.is_empty() {
        return Ok(cleaned); // Teléfono opcional
    }
    if cleaned.len() < 7 || cleaned.len() > 15 {
        return Err("El número de teléfono no tiene un formato válido".to_string());
    }
    Ok(cleaned)
}

/// Valida un NIT colombiano (formato simple: dígitos + posible guión).
#[allow(dead_code)]
pub fn validate_nit(value: &str) -> Result<String, String> {
    let cleaned: String = value.chars().filter(|c| c.is_digit(10) || *c == '-').collect();
    if cleaned.is_empty() {
        return Ok(cleaned);
    }
    Ok(cleaned)
}

/// Valida un número decimal positivo.
#[allow(dead_code)]
pub fn validate_positive_f64(value: &str, field_name: &str) -> Result<f64, String> {
    let num = value
        .parse::<f64>()
        .map_err(|_| format!("El campo '{}' no es un número válido: {}", field_name, value))?;
    if num < 0.0 {
        return Err(format!("El campo '{}' no puede ser negativo", field_name));
    }
    if !num.is_finite() {
        return Err(format!("El campo '{}' tiene un valor no permitido", field_name));
    }
    Ok(num)
}

/// Valida un número entero positivo.
#[allow(dead_code)]
pub fn validate_positive_i64(value: &str, field_name: &str) -> Result<i64, String> {
    let num = value
        .parse::<i64>()
        .map_err(|_| format!("El campo '{}' no es un número válido: {}", field_name, value))?;
    if num < 0 {
        return Err(format!("El campo '{}' no puede ser negativo", field_name));
    }
    Ok(num)
}

/// Sanitiza un string para prevenir inyección SQL (defensa en profundidad).
/// rusqlite con parámetros parametrizados ya protege contra SQLi, pero esta
/// función agrega una capa adicional para strings que se usen en LIKE o concatenación.
#[allow(dead_code)]
pub fn sanitize_sql_like(value: &str) -> String {
    value
        .replace('%', "\\%")
        .replace('_', "\\_")
        .replace('\'', "''")
}

/// Verifica que un path no contenga path traversal (../ o ..\)
#[allow(dead_code)]
pub fn validate_safe_path(path: &str) -> Result<(), String> {
    let normalized = path.replace('\\', "/");
    if normalized.contains("../") || normalized.contains("..\\") || normalized.starts_with('/') {
        return Err("Ruta de archivo no permitida".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_required_valid() {
        assert!(validate_required("  Hola  ", "nombre", 50).is_ok());
    }

    #[test]
    fn test_validate_required_empty() {
        assert!(validate_required("   ", "nombre", 50).is_err());
    }

    #[test]
    fn test_validate_required_too_long() {
        assert!(validate_required(&"a".repeat(101), "nombre", 100).is_err());
    }

    #[test]
    fn test_validate_username_valid() {
        assert!(validate_username("admin_01").is_ok());
    }

    #[test]
    fn test_validate_username_invalid_chars() {
        assert!(validate_username("admin<script>").is_err());
    }

    #[test]
    fn test_validate_password_short() {
        assert!(validate_password("12345").is_err());
    }

    #[test]
    fn test_validate_password_valid() {
        assert!(validate_password("123456").is_ok());
    }

    #[test]
    fn test_sanitize_sql_like() {
        assert_eq!(sanitize_sql_like("test%_test"), "test\\%\\_test");
    }

    #[test]
    fn test_validate_safe_path() {
        assert!(validate_safe_path("backups/backup.db").is_ok());
        assert!(validate_safe_path("../../../etc/passwd").is_err());
        assert!(validate_safe_path("..\\windows\\system32").is_err());
    }
}