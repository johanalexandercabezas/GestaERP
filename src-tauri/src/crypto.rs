//! Derivación de clave de base de datos por máquina (C1+C3).
//!
//! Prepara la arquitectura para una futura migración a SQLCipher, donde
//! `PRAGMA key` será obligatorio. Hoy SQLite estándar lo ignora, pero
//! la clave ya está diversificada por instalación: si un atacante copia
//! `gestaerp.db` de una máquina a otra y la app es recompilada con
//! SQLCipher, la BD no se podrá abrir fuera de su máquina original.
//!
//! Derivación:
//!   machine_id = SHA-256( hostname + username )
//!   db_key    = HMAC-SHA256( STATIC_SALT, machine_id )
//!
//! El resultado es un hex string de 64 caracteres.

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

/// El pepper se obtiene ahora de la configuración centralizada (crate::config)
/// permitiendo sobreescribirlo mediante la variable de entorno GESTAERP_DB_PEPPER.
/// El valor por defecto mantiene compatibilidad con versiones anteriores.

/// Obtiene un identificador estable de la máquina: hostname + username.
/// En Windows usa `gethostname` + `USERNAME`.
fn machine_identity() -> String {
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown".to_string());

    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown".to_string());

    format!("{}|{}", hostname, username)
}

/// Deriva la clave de base de datos para la máquina actual.
/// Determinista: misma máquina siempre produce la misma clave.
pub fn derive_db_key() -> String {
    let identity = machine_identity();

    // Hash de la identidad para normalizar longitud
    let mut hasher = Sha256::new();
    hasher.update(identity.as_bytes());
    let identity_hash = hasher.finalize();

    // HMAC con pepper para derivar la clave final
    let pepper = crate::config::get_db_pepper();
    let mut mac = Hmac::<Sha256>::new_from_slice(pepper.as_bytes()).expect("HMAC key length error");
    mac.update(&identity_hash);
    let result = mac.finalize().into_bytes();

    hex::encode(&result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_db_key_is_deterministic() {
        let key1 = derive_db_key();
        let key2 = derive_db_key();
        assert_eq!(key1.len(), 64, "Key must be 64 hex chars (256 bits)");
        assert_eq!(key1, key2, "Same machine must produce same key");
    }

    #[test]
    fn test_derive_db_key_is_hex() {
        let key = derive_db_key();
        assert!(
            key.chars().all(|c| c.is_ascii_hexdigit()),
            "Key must be hex"
        );
    }

    #[test]
    fn test_machine_identity_not_empty() {
        let id = machine_identity();
        assert!(!id.is_empty());
        assert!(id.contains('|'), "Identity must contain separator");
    }
}
