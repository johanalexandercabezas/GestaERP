//! Rate Limiting — Protección contra fuerza bruta y abuso de API
//!
//! Implementa un limitador simple basado en memoria (HashMap) que
//! restringe el número de intentos por clave en una ventana de tiempo.
//!
//! Para producción multi-servidor, reemplazar por Redis o similar.
//!
//! OWASP: A07:2021 Identification and Authentication Failures

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Registro de intentos para una clave específica
#[derive(Debug, Clone)]
struct RateLimitEntry {
    attempts: u32,
    first_attempt: Instant,
    blocked_until: Option<Instant>,
}

/// Limitador de tasa por clave (IP, username, endpoint, etc.)
pub struct RateLimiter {
    /// Mapa de clave -> registro de intentos
    entries: Mutex<HashMap<String, RateLimitEntry>>,
    /// Máximo de intentos permitidos en la ventana
    max_attempts: u32,
    /// Ventana de tiempo para contar intentos
    window: Duration,
    /// Tiempo de bloqueo tras exceder el límite
    block_duration: Duration,
}

impl RateLimiter {
    /// Crea un nuevo limitador con los parámetros especificados
    pub fn new(max_attempts: u32, window_secs: u64, block_secs: u64) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            max_attempts,
            window: Duration::from_secs(window_secs),
            block_duration: Duration::from_secs(block_secs),
        }
    }

    /// Intenta registrar una acción para la clave dada.
    /// Retorna Ok(()) si está permitido, Err(String) si está bloqueado.
    pub fn check(&self, key: &str) -> Result<(), String> {
        let mut entries = self.entries.lock().map_err(|e| e.to_string())?;
        let now = Instant::now();

        // Limpiar entradas expiradas periódicamente (cada 1000 checks)
        if entries.len() > 1000 {
            entries.retain(|_, entry| {
                entry.blocked_until
                    .map(|b| now < b)
                    .unwrap_or(true)
            });
        }

        let entry = entries.entry(key.to_string()).or_insert(RateLimitEntry {
            attempts: 0,
            first_attempt: now,
            blocked_until: None,
        });

        // Verificar si está bloqueado
        if let Some(blocked_until) = entry.blocked_until {
            if now < blocked_until {
                let remaining = blocked_until.duration_since(now).as_secs();
                return Err(format!(
                    "Demasiados intentos. Intente nuevamente en {} segundos.",
                    remaining
                ));
            } else {
                // Bloqueo expirado, resetear
                entry.attempts = 0;
                entry.blocked_until = None;
                entry.first_attempt = now;
            }
        }

        // Verificar si la ventana expiró
        if now.duration_since(entry.first_attempt) > self.window {
            entry.attempts = 0;
            entry.first_attempt = now;
        }

        // Incrementar intentos
        entry.attempts += 1;

        // Verificar límite
        if entry.attempts > self.max_attempts {
            entry.blocked_until = Some(now + self.block_duration);
            return Err(format!(
                "Demasiados intentos. Bloqueado por {} segundos.",
                self.block_duration.as_secs()
            ));
        }

        Ok(())
    }

    /// Resetea el contador para una clave (ej: login exitoso)
    pub fn reset(&self, key: &str) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.remove(key);
        }
    }
}

/// Rate limiter global para intentos de login.
/// 5 intentos por minuto, bloqueo de 15 minutos tras exceder.
pub static LOGIN_RATE_LIMITER: std::sync::LazyLock<RateLimiter> =
    std::sync::LazyLock::new(|| RateLimiter::new(5, 60, 900));

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_allows_within_limit() {
        let limiter = RateLimiter::new(3, 60, 10);
        assert!(limiter.check("user1").is_ok());
        assert!(limiter.check("user1").is_ok());
        assert!(limiter.check("user1").is_ok());
    }

    #[test]
    fn test_blocks_after_exceed() {
        let limiter = RateLimiter::new(2, 60, 10);
        assert!(limiter.check("user2").is_ok());
        assert!(limiter.check("user2").is_ok());
        // El tercer intento debe ser bloqueado
        assert!(limiter.check("user2").is_err());
    }

    #[test]
    fn test_different_keys_independent() {
        let limiter = RateLimiter::new(2, 60, 10);
        assert!(limiter.check("user_a").is_ok());
        assert!(limiter.check("user_b").is_ok());
        assert!(limiter.check("user_a").is_ok());
        assert!(limiter.check("user_a").is_err()); // user_a bloqueado
        assert!(limiter.check("user_b").is_ok()); // user_b aún puede
    }

    #[test]
    fn test_reset_clears_limit() {
        let limiter = RateLimiter::new(1, 60, 10);
        assert!(limiter.check("user3").is_ok());
        assert!(limiter.check("user3").is_err());
        limiter.reset("user3");
        assert!(limiter.check("user3").is_ok());
    }
}