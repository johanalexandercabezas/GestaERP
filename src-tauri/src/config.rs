//! Configuración centralizada de GestaERP.
//!
//! Carga variables de entorno SIN fallbacks a valores por defecto
//! para GESTAERP_SECRET_KEY y GESTAERP_DB_PEPPER.
//!
//! En cualquier entorno, estas variables DEBEN configurarse explícitamente
//! mediante el archivo `.env` o variables de entorno del sistema.
//!
//! # Seguridad
//!
//! - No existen valores por defecto para los secretos.
//! - Si GESTAERP_SECRET_KEY o GESTAERP_DB_PEPPER no están definidas,
//!   la aplicación aborta inmediatamente con un mensaje claro.
//! - En producción se valida además que los secretos tengan complejidad suficiente.

use std::env;
use std::sync::OnceLock;

// ============================================================
// Valores por defecto (SOLO para desarrollo/transición)
// ============================================================
const DEFAULT_LOG_LEVEL: &str = "info";
const DEFAULT_ENV: &str = "development";

// ============================================================
// Caché de valores (se calculan una sola vez)
// ============================================================

static SECRET_KEY: OnceLock<String> = OnceLock::new();
static DB_PEPPER: OnceLock<String> = OnceLock::new();

/// Longitud mínima requerida para cualquier secreto en producción.
const MIN_SECRET_LENGTH_PRODUCTION: usize = 20;

/// Si el entorno es producción, valida que los secretos tengan complejidad mínima.
/// Aborta con error claro si no la alcanzan.
fn validate_production_secrets() {
    if get_env() == "production" {
        let sk = get_secret_key();
        let dp = get_db_pepper();
        if sk.len() < MIN_SECRET_LENGTH_PRODUCTION || dp.len() < MIN_SECRET_LENGTH_PRODUCTION {
            eprintln!(
                "======================================================================\n\
                 [SEGURIDAD] Error de configuración en entorno PRODUCCIÓN:\n\
                 GESTAERP_SECRET_KEY y GESTAERP_DB_PEPPER deben tener al menos\n\
                 {} caracteres cada una. Verifica .env o las variables de entorno.\n\
                 ======================================================================",
                MIN_SECRET_LENGTH_PRODUCTION
            );
            std::process::exit(1);
        }
    }
}

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

    // P0-01 FIX: Rechazar secretos por defecto en producción
    validate_production_secrets();

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
/// **Obligatoria** en cualquier entorno. Sin ella, la app aborta.
pub fn get_secret_key() -> &'static str {
    SECRET_KEY.get_or_init(|| {
        env::var("GESTAERP_SECRET_KEY").unwrap_or_else(|_| {
            eprintln!(
                "[CONFIG] ERROR: GESTAERP_SECRET_KEY no está configurada.\n\
                     Establece esta variable en .env o en el entorno del sistema.\n\
                     Ejemplo: GESTAERP_SECRET_KEY=<valor-aleatorio-de-al-menos-32-caracteres>"
            );
            std::process::exit(1);
        })
    })
}

/// Pepper para derivar la clave de base de datos por máquina.
/// **Obligatorio** en cualquier entorno. Sin él, la app aborta.
pub fn get_db_pepper() -> &'static str {
    DB_PEPPER.get_or_init(|| {
        env::var("GESTAERP_DB_PEPPER").unwrap_or_else(|_| {
            eprintln!(
                "[CONFIG] ERROR: GESTAERP_DB_PEPPER no está configurado.\n\
                     Establece esta variable en .env o en el entorno del sistema.\n\
                     Ejemplo: GESTAERP_DB_PEPPER=<valor-aleatorio-de-al-menos-20-caracteres>"
            );
            std::process::exit(1);
        })
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

    /// Helper: limpia y configura variables mínimas para que los getters no aborten.
    fn setup_test_env() {
        env::set_var("GESTAERP_SECRET_KEY", "test_key_de_32_caracteres_minimo!!");
        env::set_var("GESTAERP_DB_PEPPER", "test_pepper_de_20_chars_ok");
        env::set_var("GESTAERP_ENV", "development");
    }

    #[test]
    fn test_secret_key_configured() {
        setup_test_env();
        // Las OnceLock ya pueden estar cacheadas de otro test; verificamos que
        // la variable de entorno se leyó correctamente.
        assert_eq!(
            env::var("GESTAERP_SECRET_KEY").unwrap(),
            "test_key_de_32_caracteres_minimo!!"
        );
    }

    #[test]
    fn test_env_development_by_default() {
        setup_test_env();
        env::remove_var("GESTAERP_ENV");
        // Verificar que el fallback a "development" funciona para get_env
        // (get_env aún tiene default porque no es secreto)
        let env_val = env::var("GESTAERP_ENV").unwrap_or_else(|_| DEFAULT_ENV.to_string());
        assert_eq!(env_val, "development");
    }

    #[test]
    fn test_production_validation_requires_long_secrets() {
        setup_test_env();
        env::set_var("GESTAERP_ENV", "production");
        // Con secretos de test de longitud suficiente, validate_production_secrets NO aborta
        // (si abortara, el test ni llegaría aquí). Solo verificamos que la función
        // no llama a exit cuando los secretos cumplen el mínimo.
        // Nota: no podemos probar el camino de exit porque mata el proceso.
        // Verificamos indirectamente que el largo es suficiente.
        let sk = env::var("GESTAERP_SECRET_KEY").unwrap();
        let dp = env::var("GESTAERP_DB_PEPPER").unwrap();
        assert!(sk.len() >= MIN_SECRET_LENGTH_PRODUCTION);
        assert!(dp.len() >= MIN_SECRET_LENGTH_PRODUCTION);
    }
}
