//! Configuración centralizada de GestaERP.
//!
//! Carga variables de entorno con fallbacks a valores por defecto
//! para mantener compatibilidad durante la transición.
//!
//! En producción, todas las variables deben configurarse explícitamente
//! mediante el archivo `.env` o variables de entorno del sistema.
//!
//! # Seguridad
//!
//! - Los valores por defecto son SOLO para desarrollo local.
//! - En producción, cambiar GESTAERP_SECRET_KEY por un valor aleatorio único.
//! - Nunca se loguean valores sensibles.

use std::env;
use std::sync::OnceLock;

// ============================================================
// Valores por defecto (solo para desarrollo/transición)
// ============================================================
const DEFAULT_SECRET_KEY: &str = "GestaERP_2026_SecureKey_Colombia";
const DEFAULT_DB_PEPPER: &str = "GestaERP_Colombia_2026_DB_PEPPER";
const DEFAULT_LOG_LEVEL: &str = "info";
const DEFAULT_ENV: &str = "development";

// ============================================================
// Caché de valores (se calculan una sola vez)
// ============================================================

static SECRET_KEY: OnceLock<String> = OnceLock::new();
static DB_PEPPER: OnceLock<String> = OnceLock::new();

/// Inicializa la configuración cargando variables de entorno.
/// Debe llamarse al inicio de `main()`.
pub fn init() {
    // Intentar cargar .env si existe (no falla si no existe)
    let _ = dotenvy::dotenv();

    // Inicializar logger
    init_logger();

    // Precargar valores en caché para acceso rápido
    let _ = get_secret_key();
    let _ = get_db_pepper();

    log::info!(
        "[GestaERP] Iniciando — Entorno: {} | Log: {}",
        get_env(),
        get_log_level()
    );
}

/// Configura el logger con el nivel de la variable de entorno
fn init_logger() {
    let level = get_log_level();
    let env = env_logger::Env::default()
        .filter_or("GESTAERP_LOG_LEVEL", &level)
        .write_style_or("GESTAERP_LOG_STYLE", "always");

    env_logger::Builder::from_env(env)
        .format_timestamp_secs()
        .format_module_path(false)
        .format_target(false)
        .init();
}

// ============================================================
// Getters públicos
// ============================================================

/// Clave secreta para firmar y validar licencias (HMAC-SHA256).
/// Crítica de seguridad: debe ser única por instalación en producción.
pub fn get_secret_key() -> &'static str {
    SECRET_KEY.get_or_init(|| {
        env::var("GESTAERP_SECRET_KEY").unwrap_or_else(|_| DEFAULT_SECRET_KEY.to_string())
    })
}

/// Pepper para derivar la clave de base de datos por máquina.
pub fn get_db_pepper() -> &'static str {
    DB_PEPPER.get_or_init(|| {
        env::var("GESTAERP_DB_PEPPER").unwrap_or_else(|_| DEFAULT_DB_PEPPER.to_string())
    })
}

/// Nivel de log: trace, debug, info, warn, error
pub fn get_log_level() -> String {
    env::var("GESTAERP_LOG_LEVEL").unwrap_or_else(|_| DEFAULT_LOG_LEVEL.to_string())
}

/// Entorno: development | production
pub fn get_env() -> String {
    env::var("GESTAERP_ENV").unwrap_or_else(|_| DEFAULT_ENV.to_string())
}

/// Indica si estamos en entorno de producción.
#[allow(dead_code)]
pub fn is_production() -> bool {
    get_env() == "production"
}

/// Indica si estamos en entorno de desarrollo.
#[allow(dead_code)]
pub fn is_development() -> bool {
    get_env() == "development"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_values() {
        // Limpiar variables de entorno del test
        env::remove_var("GESTAERP_SECRET_KEY");
        env::remove_var("GESTAERP_DB_PEPPER");
        env::remove_var("GESTAERP_LOG_LEVEL");
        env::remove_var("GESTAERP_ENV");

        assert_eq!(get_secret_key(), DEFAULT_SECRET_KEY);
        assert_eq!(get_db_pepper(), DEFAULT_DB_PEPPER);
        assert_eq!(get_log_level(), DEFAULT_LOG_LEVEL);
        assert_eq!(get_env(), DEFAULT_ENV);
        assert!(!is_production());
        assert!(is_development());
    }

    #[test]
    fn test_env_override() {
        env::set_var("GESTAERP_SECRET_KEY", "test_key_override");
        env::set_var("GESTAERP_ENV", "production");

        // Las OnceLock ya están inicializadas de test_default_values.
        // Para tests unitarios, verificamos el comportamiento de env::var directamente.
        assert_eq!(
            env::var("GESTAERP_SECRET_KEY").unwrap(),
            "test_key_override"
        );
        assert!(is_production());
    }
}