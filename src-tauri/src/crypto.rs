//! SQLCipher key derivation. The recovery phrase is never persisted.

use rand::rngs::OsRng;
use rand::RngCore;
use zeroize::Zeroize;

pub fn generate_kdf_salt() -> [u8; 16] {
    let mut salt = [0_u8; 16];
    OsRng.fill_bytes(&mut salt);
    salt
}

pub fn derive_recovery_key(phrase: &str, salt: &[u8]) -> Result<String, String> {
    if phrase.trim().chars().count() < 16 {
        return Err("La frase de recuperación debe tener al menos 16 caracteres.".to_string());
    }
    if salt.len() != 16 {
        return Err("La sal de recuperación tiene un formato inválido.".to_string());
    }

    let params = argon2::Params::new(64 * 1024, 3, 1, Some(32))
        .map_err(|error| format!("Parámetros Argon2id inválidos: {}", error))?;
    let argon2 = argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut key = [0_u8; 32];
    argon2
        .hash_password_into(phrase.trim().as_bytes(), salt, &mut key)
        .map_err(|error| format!("No se pudo derivar la clave de recuperación: {}", error))?;
    let encoded = hex::encode(key);
    key.zeroize();
    Ok(encoded)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_key_is_deterministic_for_same_salt() {
        let salt = [4_u8; 16];
        let key_1 = derive_recovery_key("correct horse battery staple", &salt).unwrap();
        let key_2 = derive_recovery_key("correct horse battery staple", &salt).unwrap();
        assert_eq!(key_1, key_2);
        assert_eq!(key_1.len(), 64);
    }

    #[test]
    fn recovery_key_rejects_short_phrases() {
        assert!(derive_recovery_key("short", &[0_u8; 16]).is_err());
    }
}
