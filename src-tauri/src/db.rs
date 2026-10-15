use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2,
};
use chrono::{Datelike, Duration as ChronoDuration, Local, Months};
use hmac::{Hmac, Mac};
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;
use zeroize::Zeroizing;

// ---------- Estructuras de datos ----------
#[derive(Serialize)]
pub struct DashboardStats {
    pub caja_actual: f64,
    pub productos_bajos: i64,
    pub ventas_hoy: f64,
    pub gastos_hoy: f64,
    pub ventas_ultimos_7_dias: Vec<f64>,
    pub ventas_ultimos_30_dias: Vec<f64>,
    pub ventas_por_mes_6: Vec<(String, f64)>,
    pub total_clientes: i64,
    pub total_proveedores: i64,
    pub cantidad_ventas_hoy: i64,
    pub producto_mas_vendido_mes: Option<ProductoEstrella>,
    pub compras_mes: f64,
    pub producto_mas_comprado_mes: Option<ProductoEstrella>,
    pub ventas_mes: f64,
    pub gastos_mes: f64,
    pub metodos_pago: Vec<(String, f64)>,
    pub top_productos_mes: Vec<(String, f64)>,
    pub productos_activos: i64,
    pub servicios_activos: i64,
    pub compras_realizadas: i64,
    pub proveedores_activos: i64,
    pub empleados_activos: i64,
}

#[derive(Serialize)]
pub struct ProductoEstrella {
    pub name: String,
    pub total_vendido: f64,
}

const KEYRING_SERVICE: &str = "GestaERP";
const KEYRING_ACCOUNT: &str = "database-key-v1";

#[derive(Serialize, Clone)]
pub struct DatabaseSecurityState {
    pub status: String,
    pub recovery_phrase_required: bool,
}

#[derive(Serialize, Clone)]
pub struct QueuedBackup {
    pub filename: String,
    pub sha256: String,
    pub attempts: i64,
}

#[derive(Serialize, Deserialize)]
struct SecurityMetadata {
    version: u32,
    kdf: String,
    salt_hex: String,
    mac_hex: String,
}

fn database_paths() -> std::result::Result<(PathBuf, PathBuf), String> {
    let data_dir = dirs::data_dir().ok_or("No se encontró el directorio de datos del sistema")?;
    let app_dir = data_dir.join("GestaERP");
    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("No se pudo crear el directorio de datos: {e}"))?;
    Ok((
        app_dir.join("gestaerp.db"),
        app_dir.join("gestaerp.security.json"),
    ))
}

fn keyring_entry() -> std::result::Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("No se pudo acceder al almacén seguro del sistema: {e}"))
}

fn keyring_get() -> std::result::Result<Option<String>, String> {
    match keyring_entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("No se pudo leer la clave del almacén seguro: {e}")),
    }
}

fn keyring_set(key: &str) -> std::result::Result<(), String> {
    keyring_entry()?
        .set_password(key)
        .map_err(|e| format!("No se pudo guardar la clave en el almacén seguro: {e}"))
}

fn is_plaintext_database(path: &Path) -> std::result::Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let mut file =
        File::open(path).map_err(|e| format!("No se pudo leer la base de datos: {e}"))?;
    let mut header = [0_u8; 16];
    use std::io::Read;
    let count = file
        .read(&mut header)
        .map_err(|e| format!("No se pudo identificar la base de datos: {e}"))?;
    Ok(count == 16 && &header == b"SQLite format 3\0")
}

fn read_security_metadata(path: &Path) -> std::result::Result<SecurityMetadata, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("No se pudo leer la metadata de seguridad: {e}"))?;
    let metadata: SecurityMetadata = serde_json::from_str(&content)
        .map_err(|e| format!("La metadata de seguridad no es válida: {e}"))?;
    if metadata.version != 1 || metadata.kdf != "argon2id-v1" {
        return Err(
            "La versión de cifrado/KDF de esta base de datos no es compatible.".to_string(),
        );
    }
    let salt = hex::decode(&metadata.salt_hex)
        .map_err(|e| format!("La sal de recuperación no es válida: {e}"))?;
    if salt.len() != 16 || hex::decode(&metadata.mac_hex).map_or(true, |mac| mac.len() != 32) {
        return Err("La metadata de recuperación tiene longitud inválida.".to_string());
    }
    Ok(metadata)
}

fn metadata_mac(key: &str, salt: &[u8]) -> std::result::Result<String, String> {
    let key_bytes =
        hex::decode(key).map_err(|e| format!("La clave SQLCipher no es válida: {e}"))?;
    let mut mac = Hmac::<Sha256>::new_from_slice(&key_bytes)
        .map_err(|e| format!("No se pudo preparar la autenticación de metadata: {e}"))?;
    mac.update(b"GestaERP-security-metadata-v1");
    mac.update(salt);
    Ok(hex::encode(mac.finalize().into_bytes()))
}

fn verify_metadata_key(metadata: &SecurityMetadata, key: &str) -> std::result::Result<(), String> {
    let salt = hex::decode(&metadata.salt_hex)
        .map_err(|e| format!("La sal de recuperación no es válida: {e}"))?;
    let key_bytes =
        hex::decode(key).map_err(|e| format!("La clave SQLCipher no es válida: {e}"))?;
    let mut mac = Hmac::<Sha256>::new_from_slice(&key_bytes)
        .map_err(|e| format!("No se pudo preparar la autenticación de metadata: {e}"))?;
    mac.update(b"GestaERP-security-metadata-v1");
    mac.update(&salt);
    mac.verify_slice(&hex::decode(&metadata.mac_hex).map_err(|e| e.to_string())?)
        .map_err(|_| "La metadata de recuperación no coincide con la clave.".to_string())
}

pub fn active_backup_material() -> std::result::Result<(Zeroizing<String>, [u8; 16]), String> {
    let (_, metadata_path) = database_paths()?;
    let key = keyring_get()?.ok_or_else(|| {
        "La base de datos está bloqueada; no se puede crear o restaurar un backup.".to_string()
    })?;
    let key = Zeroizing::new(key);
    let metadata = read_security_metadata(&metadata_path)?;
    verify_metadata_key(&metadata, key.as_str())?;
    let salt = hex::decode(&metadata.salt_hex)
        .map_err(|e| format!("La sal de recuperación no es válida: {e}"))?;
    let salt: [u8; 16] = salt
        .try_into()
        .map_err(|_| "La sal de recuperación tiene una longitud inválida.".to_string())?;
    Ok((key, salt))
}

fn write_security_metadata(path: &Path, salt: &[u8], key: &str) -> std::result::Result<(), String> {
    let metadata = SecurityMetadata {
        version: 1,
        kdf: "argon2id-v1".to_string(),
        salt_hex: hex::encode(salt),
        mac_hex: metadata_mac(key, salt)?,
    };
    let bytes = serde_json::to_vec(&metadata)
        .map_err(|e| format!("No se pudo serializar metadata: {e}"))?;
    let temp = path.with_extension(format!(
        "security.{}.{}.tmp",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|e| format!("No se pudo crear metadata temporal: {e}"))?;
    file.write_all(&bytes)
        .map_err(|e| format!("No se pudo guardar metadata: {e}"))?;
    file.sync_all()
        .map_err(|e| format!("No se pudo sincronizar metadata: {e}"))?;
    fs::rename(&temp, path).map_err(|e| format!("No se pudo instalar metadata de seguridad: {e}"))
}

pub fn database_security_state() -> std::result::Result<DatabaseSecurityState, String> {
    let (database_path, metadata_path) = database_paths()?;
    if !database_path.exists() {
        return Ok(DatabaseSecurityState {
            status: "new_database".to_string(),
            recovery_phrase_required: true,
        });
    }
    if is_plaintext_database(&database_path)? {
        return Ok(DatabaseSecurityState {
            status: "migration_required".to_string(),
            recovery_phrase_required: true,
        });
    }
    if !metadata_path.exists() {
        return Err("La base parece cifrada, pero falta su metadata de recuperación. No se modificó ningún dato.".to_string());
    }
    Ok(DatabaseSecurityState {
        status: if keyring_get()?.is_some() {
            "unlocking"
        } else {
            "recovery_required"
        }
        .to_string(),
        recovery_phrase_required: true,
    })
}

pub(crate) fn open_cipher_file(path: &Path, key: &str) -> std::result::Result<Connection, String> {
    open_cipher_database(path, key)
        .map_err(|e| format!("No se pudo abrir el archivo SQLCipher: {e}"))
}

fn open_cipher_database(path: &Path, key: &str) -> rusqlite::Result<Connection> {
    if key.len() != 64 || !key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(rusqlite::Error::InvalidParameterName(
            "Clave SQLCipher inválida".to_string(),
        ));
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(&format!("PRAGMA key = \"x'{key}'\";"))?;
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |row| {
        row.get::<_, i64>(0)
    })
    .map_err(|e| {
        rusqlite::Error::InvalidParameterName(format!(
            "No se pudo desbloquear la base (clave incorrecta o archivo dañado): {e}"
        ))
    })?;
    configure_connection(&conn)?;
    Ok(conn)
}

fn initialize_schema(conn: &Connection) -> Result<()> {
    run_migrations(conn)?;
    crate::calendar_notes::create_table(conn)?;
    crate::implementation::create_table(conn)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            backup_filename TEXT NOT NULL UNIQUE,
            sha256 TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending', 'retry', 'uploaded')),
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            last_error TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            synced_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sync_queue_due
            ON sync_queue(status, next_attempt_at);",
    )?;
    create_default_admin(conn)?;
    Ok(())
}

pub fn enqueue_backup(conn: &Connection, filename: &str, sha256: &str) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO sync_queue (backup_filename, sha256)
         VALUES (?1, ?2)",
        params![filename, sha256],
    )?;
    Ok(())
}

pub fn pending_backups(conn: &Connection, limit: i64) -> Result<Vec<QueuedBackup>> {
    let mut statement = conn.prepare_cached(
        "SELECT backup_filename, sha256, attempts
         FROM sync_queue
         WHERE status IN ('pending', 'retry')
           AND next_attempt_at <= datetime('now','localtime')
         ORDER BY id
         LIMIT ?1",
    )?;
    let rows = statement.query_map([limit.clamp(1, 100)], |row| {
        Ok(QueuedBackup {
            filename: row.get(0)?,
            sha256: row.get(1)?,
            attempts: row.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn mark_backup_uploaded(conn: &Connection, filename: &str) -> Result<()> {
    conn.execute(
        "UPDATE sync_queue
         SET status = 'uploaded', synced_at = datetime('now','localtime'),
             last_error = NULL
         WHERE backup_filename = ?1",
        [filename],
    )?;
    Ok(())
}

pub fn mark_backup_retry(conn: &Connection, filename: &str, error: &str) -> Result<()> {
    conn.execute(
        "UPDATE sync_queue
         SET status = 'retry',
             attempts = attempts + 1,
             next_attempt_at = datetime(
                 'now','localtime',
                 '+' || min(360, (1 << min(attempts, 8))) || ' minutes'
             ),
             last_error = ?2
         WHERE backup_filename = ?1",
        params![filename, error],
    )?;
    Ok(())
}

pub fn backup_sync_status(conn: &Connection) -> Result<(i64, i64)> {
    conn.query_row(
        "SELECT
            SUM(CASE WHEN status IN ('pending', 'retry') THEN 1 ELSE 0 END),
            SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END)
         FROM sync_queue",
        [],
        |row| {
            Ok((
                row.get::<_, Option<i64>>(0)?.unwrap_or(0),
                row.get::<_, Option<i64>>(1)?.unwrap_or(0),
            ))
        },
    )
}

pub fn store_backup_sync_token(token: &str) -> std::result::Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, "backup-sync-token-v1")
        .map_err(|e| format!("No se pudo acceder al almacén seguro: {e}"))?
        .set_password(token)
        .map_err(|e| format!("No se pudo guardar el token remoto: {e}"))
}

pub fn backup_sync_token() -> std::result::Result<Option<Zeroizing<String>>, String> {
    match keyring::Entry::new(KEYRING_SERVICE, "backup-sync-token-v1")
        .map_err(|e| format!("No se pudo acceder al almacén seguro: {e}"))?
        .get_password()
    {
        Ok(token) => Ok(Some(Zeroizing::new(token))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("No se pudo leer el token remoto: {e}")),
    }
}

fn verify_integrity(conn: &Connection) -> rusqlite::Result<()> {
    let result: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if result != "ok" {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "La comprobación de integridad falló: {result}"
        )));
    }
    Ok(())
}

fn remove_if_present(path: &Path) -> std::result::Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("No se pudo eliminar {}: {error}", path.display())),
    }
}

pub(crate) fn export_to_sqlcipher(
    source: &Connection,
    temp_path: &Path,
    key: &str,
) -> std::result::Result<(), String> {
    let destination = temp_path.to_string_lossy().replace('\'', "''");
    let attach = format!("ATTACH DATABASE '{destination}' AS encrypted KEY \"x'{key}'\";");
    source
        .execute_batch(&attach)
        .map_err(|e| format!("No se pudo crear el destino SQLCipher: {e}"))?;
    let export_result = source.query_row("SELECT sqlcipher_export('encrypted')", [], |_| Ok(()));
    let detach_result = source.execute_batch("DETACH DATABASE encrypted;");
    export_result.map_err(|e| format!("Falló la exportación SQLCipher de la base: {e}"))?;
    detach_result.map_err(|e| format!("No se pudo cerrar el destino SQLCipher: {e}"))?;

    let encrypted = open_cipher_database(temp_path, key)
        .map_err(|e| format!("El archivo cifrado no superó la verificación de apertura: {e}"))?;
    verify_integrity(&encrypted)
        .map_err(|e| format!("El archivo cifrado no superó integrity_check: {e}"))?;
    Ok(())
}

fn migrate_plaintext_database(database_path: &Path, key: &str) -> std::result::Result<(), String> {
    let source = Connection::open(database_path)
        .map_err(|e| format!("No se pudo abrir la base existente: {e}"))?;
    configure_connection(&source)
        .map_err(|e| format!("No se pudo configurar la base existente: {e}"))?;
    initialize_schema(&source)
        .map_err(|e| format!("No se pudieron completar las migraciones antes del cifrado: {e}"))?;
    let (checkpoint_busy, _, _): (i64, i64, i64) = source
        .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| format!("No se pudo consolidar el WAL antes del cifrado: {e}"))?;
    if checkpoint_busy != 0 {
        return Err("La base sigue teniendo lectores activos; se canceló la migración para evitar perder transacciones.".to_string());
    }

    let temp_path = database_path.with_extension(format!("encrypted.{}.tmp", std::process::id()));
    let _ = fs::remove_file(&temp_path);
    if let Err(error) = export_to_sqlcipher(&source, &temp_path, key) {
        if temp_path.exists() {
            fs::remove_file(&temp_path).map_err(|cleanup| {
                format!("{error}; no se pudo limpiar el archivo temporal: {cleanup}")
            })?;
        }
        return Err(error);
    }
    drop(source);

    let old_path =
        database_path.with_extension(format!("plaintext-{}.db", chrono::Utc::now().timestamp()));
    fs::rename(database_path, &old_path)
        .map_err(|e| format!("No se pudo apartar de forma recuperable la base original: {e}"))?;
    if let Err(error) = fs::rename(&temp_path, database_path) {
        let _ = fs::rename(&old_path, database_path);
        return Err(format!(
            "No se pudo instalar la base cifrada; se restauró el archivo original: {error}"
        ));
    }
    remove_if_present(&database_path.with_extension("db-wal"))?;
    remove_if_present(&database_path.with_extension("db-shm"))?;
    fs::remove_file(&old_path).map_err(|e| {
        format!("La base está cifrada, pero no se pudo eliminar la copia temporal sin cifrar: {e}")
    })?;
    Ok(())
}

pub fn secure_database(recovery_phrase: &str) -> std::result::Result<Connection, String> {
    let (database_path, metadata_path) = database_paths()?;
    let salt = crate::crypto::generate_kdf_salt();
    let key = Zeroizing::new(crate::crypto::derive_recovery_key(recovery_phrase, &salt)?);

    if database_path.exists() {
        if !is_plaintext_database(&database_path)? {
            return Err("La base ya está cifrada o tiene un formato desconocido; usa recuperación en vez de reinicializarla.".to_string());
        }
        if metadata_path.exists() {
            fs::remove_file(&metadata_path).map_err(|e| {
                format!("No se pudo limpiar metadata de una migración interrumpida: {e}")
            })?;
        }
        write_security_metadata(&metadata_path, &salt, key.as_str())?;
        if let Err(error) = migrate_plaintext_database(&database_path, key.as_str()) {
            match is_plaintext_database(&database_path) {
                Ok(true) => {
                    remove_if_present(&metadata_path).map_err(|cleanup| {
                        format!("{error}; no se pudo limpiar metadata temporal: {cleanup}")
                    })?;
                }
                Ok(false) => {}
                Err(check) => {
                    return Err(format!(
                        "{error}; no se pudo determinar el estado de la migración ({check}); se conservó la metadata para recuperación"
                    ));
                }
            }
            return Err(error);
        }
        keyring_set(key.as_str())?;
    } else {
        if metadata_path.exists() {
            remove_if_present(&metadata_path)?;
        }
        let temp_path =
            database_path.with_extension(format!("encrypted.{}.tmp", std::process::id()));
        let _ = fs::remove_file(&temp_path);
        let conn = match open_cipher_database(&temp_path, key.as_str()) {
            Ok(conn) => conn,
            Err(error) => {
                let _ = fs::remove_file(&temp_path);
                return Err(format!("No se pudo crear la base cifrada: {error}"));
            }
        };
        if let Err(error) = initialize_schema(&conn) {
            drop(conn);
            fs::remove_file(&temp_path).map_err(|cleanup| {
                format!(
                    "No se pudo inicializar el esquema ({error}) ni limpiar el temporal: {cleanup}"
                )
            })?;
            return Err(format!("No se pudo inicializar el esquema: {error}"));
        }
        if let Err(error) = verify_integrity(&conn) {
            drop(conn);
            fs::remove_file(&temp_path)
                .map_err(|cleanup| format!("La base nueva falló integrity_check ({error}) y el temporal no pudo limpiarse: {cleanup}"))?;
            return Err(format!("La base nueva no superó integrity_check: {error}"));
        }
        drop(conn);
        if let Err(error) = write_security_metadata(&metadata_path, &salt, key.as_str()) {
            let _ = fs::remove_file(&temp_path);
            return Err(error);
        }
        if let Err(error) = keyring_set(key.as_str()) {
            let _ = fs::remove_file(&metadata_path);
            let _ = fs::remove_file(&temp_path);
            return Err(error);
        }
        if let Err(error) = fs::rename(&temp_path, &database_path) {
            let _ = fs::remove_file(&metadata_path);
            let _ = fs::remove_file(&temp_path);
            return Err(format!("No se pudo instalar la base cifrada: {error}"));
        }
    }
    let conn = open_cipher_database(&database_path, key.as_str())
        .map_err(|e| format!("No se pudo reabrir la base cifrada: {e}"))?;
    initialize_schema(&conn)
        .map_err(|e| format!("No se pudo inicializar el esquema cifrado: {e}"))?;
    enable_wal(&conn).map_err(|e| format!("No se pudo habilitar WAL: {e}"))?;
    Ok(conn)
}

pub fn recover_database(
    recovery_phrase: &str,
    backup_filename: Option<&str>,
) -> std::result::Result<Connection, String> {
    let (database_path, metadata_path) = database_paths()?;
    if !database_path.exists() {
        let backup_filename = backup_filename.ok_or_else(|| {
            "No existe una base de datos; proporciona un backup .gbackup para restaurar."
                .to_string()
        })?;
        let backup_path = crate::backup::recovery_backup_path(backup_filename)?;
        let temp_path = database_path.with_extension(format!("restore.{}.tmp", std::process::id()));
        let salt = crate::backup::extract_encrypted_snapshot(&backup_path, &temp_path)?;
        let key = Zeroizing::new(crate::crypto::derive_recovery_key(recovery_phrase, &salt)?);
        let result = (|| {
            let conn = open_cipher_database(&temp_path, key.as_str())
                .map_err(|e| format!("Frase incorrecta o backup dañado: {e}"))?;
            verify_integrity(&conn).map_err(|e| format!("Backup corrupto: {e}"))?;
            initialize_schema(&conn)
                .map_err(|e| format!("No se pudieron aplicar las migraciones al backup: {e}"))?;
            enable_wal(&conn).map_err(|e| format!("No se pudo habilitar WAL: {e}"))?;
            drop(conn);

            if metadata_path.exists() {
                fs::remove_file(&metadata_path)
                    .map_err(|e| format!("No se pudo limpiar metadata anterior: {e}"))?;
            }
            write_security_metadata(&metadata_path, &salt, key.as_str())?;
            if let Err(error) = fs::rename(&temp_path, &database_path) {
                let _ = fs::remove_file(&metadata_path);
                return Err(format!("No se pudo instalar la base restaurada: {error}"));
            }
            keyring_set(key.as_str())?;
            open_cipher_database(&database_path, key.as_str())
                .map_err(|e| format!("No se pudo abrir la base restaurada: {e}"))
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temp_path);
        }
        return result;
    }
    if backup_filename.is_some() {
        return Err("La base ya existe; no se permite restaurar un backup sobre una base existente desde la pantalla de recuperación.".to_string());
    }
    let metadata = read_security_metadata(&metadata_path)?;
    let salt = hex::decode(&metadata.salt_hex)
        .map_err(|e| format!("La sal de recuperación no es válida: {e}"))?;
    let key = Zeroizing::new(crate::crypto::derive_recovery_key(recovery_phrase, &salt)?);
    verify_metadata_key(&metadata, key.as_str())?;
    let conn = open_cipher_database(&database_path, key.as_str()).map_err(|e| e.to_string())?;
    verify_integrity(&conn).map_err(|e| e.to_string())?;
    initialize_schema(&conn).map_err(|e| format!("No se pudieron aplicar migraciones: {e}"))?;
    enable_wal(&conn).map_err(|e| format!("No se pudo habilitar WAL: {e}"))?;
    keyring_set(key.as_str())?;
    Ok(conn)
}

pub fn open_from_keyring() -> std::result::Result<Option<Connection>, String> {
    let (database_path, metadata_path) = database_paths()?;
    if !database_path.exists() || is_plaintext_database(&database_path)? {
        return Ok(None);
    }
    if !metadata_path.exists() {
        return Err("Falta la metadata de recuperación de la base cifrada.".to_string());
    }
    let Some(key) = keyring_get()? else {
        return Ok(None);
    };
    let key = Zeroizing::new(key);
    let metadata = read_security_metadata(&metadata_path)?;
    verify_metadata_key(&metadata, key.as_str())?;
    let conn = open_cipher_database(&database_path, key.as_str()).map_err(|e| e.to_string())?;
    initialize_schema(&conn)
        .map_err(|e| format!("No se pudieron ejecutar las migraciones: {e}"))?;
    enable_wal(&conn).map_err(|e| format!("No se pudo habilitar WAL: {e}"))?;
    Ok(Some(conn))
}

fn sales_for_recent_days(conn: &Connection, days: usize) -> Result<Vec<f64>> {
    let today = Local::now().date_naive();
    let first_day = today - ChronoDuration::days(days.saturating_sub(1) as i64);
    let end_day = today + ChronoDuration::days(1);
    let start_bound = first_day.format("%Y-%m-%d").to_string();
    let end_bound = end_day.format("%Y-%m-%d").to_string();

    let mut stmt = conn.prepare_cached(
        "SELECT date(created_at), COALESCE(SUM(total), 0)
         FROM sales
         WHERE created_at >= ?1 AND created_at < ?2
         GROUP BY date(created_at)",
    )?;
    let rows = stmt.query_map(params![start_bound, end_bound], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?;
    let mut totals_by_day = HashMap::new();
    for row in rows {
        let (day, total) = row?;
        totals_by_day.insert(day, total);
    }

    Ok((0..days)
        .rev()
        .map(|offset| {
            let day = (today - ChronoDuration::days(offset as i64))
                .format("%Y-%m-%d")
                .to_string();
            totals_by_day.get(&day).copied().unwrap_or(0.0)
        })
        .collect())
}

fn sales_for_recent_months(conn: &Connection, months: usize) -> Result<Vec<(String, f64)>> {
    let current_month = Local::now()
        .date_naive()
        .with_day(1)
        .ok_or(rusqlite::Error::InvalidQuery)?;
    let first_month = current_month
        .checked_sub_months(Months::new(months.saturating_sub(1) as u32))
        .ok_or(rusqlite::Error::InvalidQuery)?;
    let end_month = current_month
        .checked_add_months(Months::new(1))
        .ok_or(rusqlite::Error::InvalidQuery)?;
    let start_bound = first_month.format("%Y-%m-%d").to_string();
    let end_bound = end_month.format("%Y-%m-%d").to_string();

    let mut stmt = conn.prepare_cached(
        "SELECT strftime('%Y-%m', created_at), COALESCE(SUM(total), 0)
         FROM sales
         WHERE created_at >= ?1 AND created_at < ?2
         GROUP BY strftime('%Y-%m', created_at)",
    )?;
    let rows = stmt.query_map(params![start_bound, end_bound], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?;
    let mut totals_by_month = HashMap::new();
    for row in rows {
        let (month, total) = row?;
        totals_by_month.insert(month, total);
    }

    (0..months)
        .map(|offset| {
            let month = current_month
                .checked_sub_months(Months::new(offset as u32))
                .ok_or(rusqlite::Error::InvalidQuery)?
                .format("%Y-%m")
                .to_string();
            Ok((
                month.clone(),
                totals_by_month.get(&month).copied().unwrap_or(0.0),
            ))
        })
        .collect()
}

fn configure_connection(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = -32000;",
    )?;
    conn.busy_timeout(Duration::from_secs(5))?;
    Ok(())
}

fn enable_wal(conn: &Connection) -> Result<()> {
    let journal_mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;
    if !journal_mode.eq_ignore_ascii_case("wal") {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "SQLite no pudo habilitar WAL; modo activo: {}",
            journal_mode
        )));
    }
    Ok(())
}

// ---------- Apertura de base de datos ----------
pub fn open_database() -> Result<Connection> {
    let (database_path, metadata_path) =
        database_paths().map_err(rusqlite::Error::InvalidParameterName)?;
    if !metadata_path.exists() {
        return Err(rusqlite::Error::InvalidParameterName(
            "La base no está inicializada con SQLCipher.".to_string(),
        ));
    }
    let key = keyring_get()
        .map_err(rusqlite::Error::InvalidParameterName)?
        .ok_or_else(|| {
            rusqlite::Error::InvalidParameterName(
                "La base está bloqueada; se requiere la frase de recuperación.".to_string(),
            )
        })?;
    let key = Zeroizing::new(key);
    let metadata =
        read_security_metadata(&metadata_path).map_err(rusqlite::Error::InvalidParameterName)?;
    verify_metadata_key(&metadata, key.as_str()).map_err(rusqlite::Error::InvalidParameterName)?;
    let conn = open_cipher_database(&database_path, key.as_str())?;
    enable_wal(&conn)?;
    Ok(conn)
}

// ---------- Configuración (settings) ----------
pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
        row.get(0)
    })
    .ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

// ---------- Autenticación ----------
pub fn verify_password(conn: &Connection, username: &str, password: &str) -> Result<bool, String> {
    let stored_hash: String = conn
        .query_row(
            "SELECT password FROM users WHERE username = ?1 AND active = 1",
            [username],
            |row| row.get(0),
        )
        .map_err(|e| format!("Usuario no encontrado: {}", e))?;

    let parsed_hash =
        PasswordHash::new(&stored_hash).map_err(|e| format!("Error al leer hash: {}", e))?;

    if Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
    {
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn get_user_info(conn: &Connection, username: &str) -> Option<(i64, String, String)> {
    conn.query_row(
        "SELECT id, full_name, role FROM users WHERE username = ?1 AND active = 1",
        [username],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .ok()
}

// ---------- Dashboard ----------
pub fn get_dashboard_stats(conn: &Connection) -> Result<DashboardStats> {
    let caja_actual = match conn.query_row(
        "SELECT current_balance FROM cash_registers WHERE status = 'open' ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0),
    ) {
        Ok(val) => val,
        Err(rusqlite::Error::QueryReturnedNoRows) => 0.0,
        Err(e) => return Err(e),
    };

    let productos_bajos = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE active = 1 AND stock <= min_stock",
        [],
        |row| row.get(0),
    )?;

    let ventas_hoy = conn.query_row(
        "SELECT COALESCE(SUM(total), 0) FROM sales WHERE date(created_at) = date('now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let gastos_hoy = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE date(created_at) = date('now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let cantidad_ventas_hoy = conn.query_row(
        "SELECT COUNT(*) FROM sales WHERE date(created_at) = date('now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let total_clientes = conn.query_row("SELECT COUNT(*) FROM customers", [], |row| row.get(0))?;

    let total_proveedores =
        conn.query_row("SELECT COUNT(*) FROM suppliers", [], |row| row.get(0))?;

    let ventas_mes = conn.query_row(
        "SELECT COALESCE(SUM(total), 0) FROM sales WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let gastos_mes = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let compras_mes = conn.query_row(
        "SELECT COALESCE(SUM(total), 0) FROM purchases WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let ventas_ultimos_30_dias = sales_for_recent_days(conn, 30)?;
    let ventas_ultimos_7_dias = ventas_ultimos_30_dias[23..].to_vec();

    let producto_mas_vendido_mes = match conn.query_row(
        "SELECT p.name, SUM(si.quantity) as total_vendido FROM sale_items si JOIN products p ON p.id = si.product_id JOIN sales s ON s.id = si.sale_id WHERE strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime') GROUP BY si.product_id ORDER BY total_vendido DESC LIMIT 1",
        [],
        |row| Ok(ProductoEstrella { name: row.get(0)?, total_vendido: row.get(1)? }),
    ) {
        Ok(p) => Some(p),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(e) => return Err(e),
    };

    let producto_mas_comprado_mes = match conn.query_row(
        "SELECT pi.product_name as name, SUM(pi.quantity) as total_vendido FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id WHERE strftime('%Y-%m', pu.created_at) = strftime('%Y-%m', 'now', 'localtime') GROUP BY pi.product_id ORDER BY total_vendido DESC LIMIT 1",
        [],
        |row| Ok(ProductoEstrella { name: row.get(0)?, total_vendido: row.get(1)? }),
    ) {
        Ok(p) => Some(p),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(e) => return Err(e),
    };

    // Nuevos campos para dashboard profesional
    let productos_activos = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE active = 1",
        [],
        |row| row.get(0),
    )?;

    let servicios_activos = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE active = 1 AND price > 0 AND (unit = 'SERVICIO' OR unit = 'HORA' OR unit = 'DÍA')",
        [], |row| row.get(0),
    )?;

    let compras_realizadas =
        conn.query_row("SELECT COUNT(*) FROM purchases", [], |row| row.get(0))?;

    let proveedores_activos_sql =
        conn.query_row("SELECT COUNT(*) FROM suppliers", [], |row| row.get(0))?;

    let empleados_activos = conn.query_row(
        "SELECT COUNT(*) FROM employees WHERE active = 1",
        [],
        |row| row.get(0),
    )?;

    let ventas_por_mes_6 = sales_for_recent_months(conn, 6)?;

    // Métodos de pago del mes
    let mut stmt = conn.prepare(
        "SELECT payment_method, COUNT(*) as cnt FROM sales WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime') GROUP BY payment_method"
    ).map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
    let metodos_pago: Vec<(String, f64)> = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Top 5 productos del mes
    let mut stmt = conn.prepare(
        "SELECT p.name, SUM(si.quantity) as total_vendido FROM sale_items si JOIN products p ON p.id = si.product_id JOIN sales s ON s.id = si.sale_id WHERE strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime') GROUP BY si.product_id ORDER BY total_vendido DESC LIMIT 5"
    ).map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
    let top_productos_mes: Vec<(String, f64)> = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(DashboardStats {
        caja_actual,
        productos_bajos,
        ventas_hoy,
        gastos_hoy,
        ventas_ultimos_7_dias,
        ventas_ultimos_30_dias,
        ventas_por_mes_6,
        total_clientes,
        total_proveedores,
        cantidad_ventas_hoy,
        producto_mas_vendido_mes,
        compras_mes,
        producto_mas_comprado_mes,
        ventas_mes,
        gastos_mes,
        metodos_pago,
        top_productos_mes,
        productos_activos,
        servicios_activos,
        compras_realizadas,
        proveedores_activos: proveedores_activos_sql,
        empleados_activos,
    })
}

// ---------- Migraciones ----------

/// Migración inicial: crea todas las tablas y aplica los ALTER de compatibilidad
const MIGRATION_001_INITIAL: &str = r#"
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    full_name  TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'cashier',
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS suppliers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    nit        TEXT,
    phone      TEXT,
    email      TEXT,
    doc_type   TEXT DEFAULT 'NIT',
    city       TEXT DEFAULT '',
    address    TEXT DEFAULT '',
    payment_method TEXT DEFAULT 'Transferencia',
    bank_account TEXT DEFAULT '',
    iva_responsible INTEGER DEFAULT 0,
    offers_credit INTEGER DEFAULT 0,
    credit_days INTEGER DEFAULT 0,
    credit_limit REAL DEFAULT 0.0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS customers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    doc_type   TEXT DEFAULT 'CC',
    doc_number TEXT,
    phone      TEXT,
    email      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sku         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    price       REAL NOT NULL,
    cost        REAL NOT NULL DEFAULT 0,
    stock       REAL NOT NULL DEFAULT 0,
    min_stock   REAL NOT NULL DEFAULT 0,
    max_stock   REAL NOT NULL DEFAULT 0,
    iva_percent REAL NOT NULL DEFAULT 0,
    unit        TEXT DEFAULT 'UNIDAD',
    active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cash_registers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    open_date  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    close_date TEXT,
    initial_balance REAL NOT NULL DEFAULT 0,
    current_balance REAL NOT NULL DEFAULT 0,
    final_balance   REAL,
    status     TEXT NOT NULL DEFAULT 'open',
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL,
    movement_type TEXT NOT NULL,
    quantity    REAL NOT NULL,
    unit_price  REAL,
    reason      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS sales (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    customer_id     INTEGER,
    total           REAL NOT NULL,
    payment_method  TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id     INTEGER NOT NULL,
    product_id  INTEGER NOT NULL,
    quantity    REAL NOT NULL,
    unit_price  REAL NOT NULL,
    total_price REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS purchases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    supplier_id INTEGER,
    supplier_name TEXT NOT NULL DEFAULT 'Proveedor',
    invoice_number TEXT DEFAULT '',
    total       REAL NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    product_id  INTEGER,
    product_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    quantity    REAL NOT NULL,
    unit_cost   REAL NOT NULL,
    total_cost  REAL NOT NULL,
    iva_percent REAL DEFAULT 0,
    unit        TEXT DEFAULT 'UNIDAD',
    FOREIGN KEY (purchase_id) REFERENCES purchases(id)
);

CREATE TABLE IF NOT EXISTS expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    description TEXT NOT NULL,
    amount      REAL NOT NULL,
    category    TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Efectivo',
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    supplier_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS receivables (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    sale_id     INTEGER NOT NULL,
    total       REAL NOT NULL,
    paid        REAL NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS receivable_payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    receivable_id INTEGER NOT NULL,
    amount      REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Efectivo',
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (receivable_id) REFERENCES receivables(id)
);

CREATE TABLE IF NOT EXISTS employees (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    doc_type        TEXT DEFAULT 'CC',
    doc_number      TEXT,
    position        TEXT DEFAULT 'Empleado',
    base_salary     REAL NOT NULL,
    transport_allowance INTEGER DEFAULT 0,
    payment_frequency TEXT DEFAULT 'Mensual',
    risk_level      TEXT DEFAULT 'I',
    phone           TEXT DEFAULT '',
    email           TEXT DEFAULT '',
    city            TEXT DEFAULT '',
    address         TEXT DEFAULT '',
    hire_date       TEXT DEFAULT '',
    eps             TEXT DEFAULT '',
    arl             TEXT DEFAULT '',
    afp             TEXT DEFAULT '',
    ccf             TEXT DEFAULT '',
    has_social_security INTEGER DEFAULT 0,
    department      TEXT DEFAULT '',
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS payroll_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL,
    period          TEXT NOT NULL,
    payment_frequency TEXT DEFAULT 'Mensual',
    days_worked     REAL DEFAULT 30,
    basic_salary    REAL NOT NULL,
    transport_allowance REAL DEFAULT 0,
    overtime_day_hours REAL DEFAULT 0,
    overtime_night_hours REAL DEFAULT 0,
    sunday_hours    REAL DEFAULT 0,
    holiday_hours   REAL DEFAULT 0,
    total_earnings  REAL NOT NULL,
    health_deduction REAL DEFAULT 0,
    pension_deduction REAL DEFAULT 0,
    net_salary      REAL NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS licenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL UNIQUE,
    plan        TEXT NOT NULL,
    activated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    expires_at  TEXT NOT NULL,
    max_users   INTEGER NOT NULL DEFAULT 1,
    active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS physical_counts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'borrador',
    notes       TEXT DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS physical_count_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id        INTEGER NOT NULL,
    product_id      INTEGER NOT NULL,
    theoretical_qty REAL NOT NULL DEFAULT 0,
    counted_qty     REAL NOT NULL DEFAULT 0,
    difference      REAL NOT NULL DEFAULT 0,
    adjusted        INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (count_id) REFERENCES physical_counts(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('iva_responsable', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('department', 'CUNDINAMARCA');
INSERT OR IGNORE INTO settings (key, value) VALUES ('license_plan', 'none');
"#;

/// Aplica las migraciones pendientes según la versión almacenada en `schema_migrations`
fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )",
        [],
    )?;

    let current_version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let migrations: Vec<(i32, &str, &str)> = vec![
        (1, "Esquema inicial completo", MIGRATION_001_INITIAL),
        (2, "Cotizaciones (v1.1)", MIGRATION_002_QUOTATIONS),
        (3, "Cuentas por pagar (v1.2)", MIGRATION_003_PAYABLES),
        (4, "Auditoría (v2.0)", MIGRATION_004_AUDIT),
        (5, "Cierre contable (v2.0)", MIGRATION_005_CLOSURES),
        (6, "Consecutivos (v2.0)", MIGRATION_006_NUMBERING),
        (
            7,
            "Auditoría schema + índices + multi-tenancy (v2.1)",
            MIGRATION_007_AUDIT_SCHEMA,
        ),
        (
            8,
            "Schema evolution + timestamps + soft-delete + multi-tenancy (v2.2)",
            MIGRATION_008_SCHEMA_EVOLUTION,
        ),
        (
            9,
            "Preguntas de recuperación local para administradores",
            MIGRATION_009_PASSWORD_RECOVERY,
        ),
        (
            10,
            "Registro versionado de aceptación de términos y aviso de privacidad",
            MIGRATION_010_LEGAL_ACCEPTANCES,
        ),
        (
            11,
            "Trazabilidad versionada de bases de tratamiento por titular",
            MIGRATION_011_PERSONAL_DATA_RECORDS,
        ),
    ];

    for (version, description, sql) in &migrations {
        if *version > current_version {
            println!("Aplicando migración {}: {}", version, description);
            // AUD-008 FIX: Ejecuta la migración con tolerancia a columnas duplicadas.
            execute_migration_batch(conn, sql)?;
            conn.execute(
                "INSERT INTO schema_migrations (version) VALUES (?1)",
                [*version],
            )?;
            println!("Migración {} aplicada correctamente.", version);
        }
    }

    Ok(())
}

/// Ejecuta un bloque SQL como migración, partiendo por `;` y tolerando errores
/// de "duplicate column" (ya existía la columna de un ALTER anterior).
/// Cualquier otro error se propaga.
fn execute_migration_batch(conn: &Connection, sql: &str) -> Result<()> {
    for stmt in sql.split(';') {
        let trimmed = stmt.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Err(e) = conn.execute(trimmed, []) {
            let msg = e.to_string();
            if msg.contains("duplicate column") || msg.contains("already exists") {
                continue;
            }
            return Err(e);
        }
    }
    Ok(())
}

fn create_default_admin(_conn: &Connection) -> Result<()> {
    // No se crean usuarios administrativos con credenciales fijas ni predecibles.
    // El primer administrador se crea mediante un flujo explícito y seguro en la
    // pantalla de configuración inicial.
    Ok(())
}

/// Migración 008 (v2.2): Schema evolution — nuevas columnas en tablas existentes,
/// timestamps universales, soft delete, empresa_id (multi-tenancy).
/// Reemplaza los ALTERs incondicionales del bloque anterior, ahora versionado.
const MIGRATION_008_SCHEMA_EVOLUTION: &str = r#"
-- ============================================================
-- MIGRACIÓN 008: Columnas adicionales (proveedores, productos,
-- compras, empleados, timestamps, soft delete, multi-tenancy)
-- ============================================================

-- ── Proveedores ──
ALTER TABLE suppliers ADD COLUMN doc_type TEXT DEFAULT 'NIT';
ALTER TABLE suppliers ADD COLUMN city TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN address TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN payment_method TEXT DEFAULT 'Transferencia';
ALTER TABLE suppliers ADD COLUMN bank_account TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN bank_name TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN iva_responsible INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN offers_credit INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN credit_days INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN credit_limit REAL DEFAULT 0.0;

-- ── Productos ──
ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'UNIDAD';

-- ── Compras ──
ALTER TABLE purchases ADD COLUMN invoice_number TEXT DEFAULT '';
ALTER TABLE purchase_items ADD COLUMN product_name TEXT DEFAULT '';
ALTER TABLE purchase_items ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE purchase_items ADD COLUMN iva_percent REAL DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN unit TEXT DEFAULT 'UNIDAD';

-- ── Clientes ──
ALTER TABLE customers ADD COLUMN doc_type TEXT DEFAULT 'CC';

-- ── Caja ──
ALTER TABLE cash_registers ADD COLUMN current_balance REAL NOT NULL DEFAULT 0;

-- ── Empleados ──
ALTER TABLE employees ADD COLUMN phone TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN email TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN city TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN address TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN hire_date TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN eps TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN arl TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN afp TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN ccf TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN payment_frequency TEXT DEFAULT 'Mensual';
ALTER TABLE employees ADD COLUMN risk_level TEXT DEFAULT 'I';
ALTER TABLE employees ADD COLUMN has_social_security INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN department TEXT DEFAULT '';

-- ── Nómina ──
ALTER TABLE payroll_entries ADD COLUMN payment_frequency TEXT DEFAULT 'Mensual';
ALTER TABLE payroll_entries ADD COLUMN days_worked REAL DEFAULT 30;

-- ── Licencias ──
ALTER TABLE licenses ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

-- ── Gastos ──
ALTER TABLE expenses ADD COLUMN supplier_id INTEGER;
ALTER TABLE expenses ADD COLUMN supplier_name TEXT DEFAULT '';

-- ── Timestamps y Soft Delete ──
ALTER TABLE products ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'));
ALTER TABLE products ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN deleted_at TEXT;
ALTER TABLE sale_items ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'));
ALTER TABLE sale_items ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE purchase_items ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'));
ALTER TABLE purchase_items ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE sales ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE sales ADD COLUMN deleted_at TEXT;
ALTER TABLE purchases ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE purchases ADD COLUMN deleted_at TEXT;
ALTER TABLE expenses ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE expenses ADD COLUMN deleted_at TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN deleted_at TEXT;
ALTER TABLE customers ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE customers ADD COLUMN deleted_at TEXT;
ALTER TABLE suppliers ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE suppliers ADD COLUMN deleted_at TEXT;
ALTER TABLE employees ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN deleted_at TEXT;
ALTER TABLE receivables ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE receivables ADD COLUMN deleted_at TEXT;
ALTER TABLE receivable_payments ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE physical_count_items ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'));
ALTER TABLE physical_count_items ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE quotation_items ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'));
ALTER TABLE quotation_items ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE inventory_movements ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE physical_counts ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE cash_registers ADD COLUMN updated_at TEXT DEFAULT '';

-- ── empresa_id para multi-tenancy futuro ──
ALTER TABLE users ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE sales ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE purchases ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE expenses ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE customers ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE suppliers ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE employees ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE cash_registers ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE receivables ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE payables ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE quotations ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE physical_counts ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE inventory_movements ADD COLUMN empresa_id INTEGER DEFAULT 1;
"#;

const MIGRATION_009_PASSWORD_RECOVERY: &str = r#"
CREATE TABLE IF NOT EXISTS password_recovery_answers (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    answer_hash TEXT NOT NULL,
    PRIMARY KEY (user_id, question_id)
);
CREATE TABLE IF NOT EXISTS password_recovery_attempts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_started_at INTEGER NOT NULL,
    blocked_until INTEGER
);
"#;

const MIGRATION_010_LEGAL_ACCEPTANCES: &str = r#"
CREATE TABLE IF NOT EXISTS legal_acceptances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_type TEXT NOT NULL CHECK (document_type IN ('terms', 'privacy_notice')),
    document_version TEXT NOT NULL,
    accepted_at TEXT NOT NULL,
    app_version TEXT NOT NULL,
    acceptance_method TEXT NOT NULL CHECK (acceptance_method = 'desktop_checkbox')
);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_document_version
    ON legal_acceptances (document_type, document_version);
"#;

const MIGRATION_011_PERSONAL_DATA_RECORDS: &str = r#"
CREATE TABLE IF NOT EXISTS personal_data_processing_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('customer', 'supplier', 'employee')),
    subject_id INTEGER NOT NULL,
    basis TEXT NOT NULL CHECK (basis IN ('authorization', 'legal_exception', 'not_personal_data')),
    basis_detail TEXT NOT NULL DEFAULT '',
    purpose TEXT NOT NULL,
    effective_date TEXT NOT NULL,
    evidence_method TEXT NOT NULL,
    evidence_reference TEXT NOT NULL DEFAULT '',
    recorded_at TEXT NOT NULL,
    recorded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    recorded_by_name TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_data_records_subject
    ON personal_data_processing_records (subject_type, subject_id, id DESC);
"#;

pub fn init_db() -> Result<Connection> {
    let mut conn = open_database()?;
    initialize_schema(&conn)?;
    enable_wal(&conn)?;
    Ok(conn)
}

const MIGRATION_002_QUOTATIONS: &str = r#"
CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consecutive TEXT NOT NULL UNIQUE,
    date TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    due_date TEXT,
    customer_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_doc TEXT,
    items TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    iva_percent REAL NOT NULL DEFAULT 0,
    iva_amount REAL NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    observations TEXT,
    status TEXT NOT NULL DEFAULT 'Borrador',
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quotation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    description TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    iva_percent REAL NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(date);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
"#;

const MIGRATION_003_PAYABLES: &str = r#"
CREATE TABLE IF NOT EXISTS payables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    supplier_name TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    balance REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pendiente',
    observations TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payable_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payable_id INTEGER NOT NULL,
    payment_date TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Efectivo',
    reference TEXT,
    observations TEXT,
    created_by INTEGER NOT NULL,
    FOREIGN KEY (payable_id) REFERENCES payables(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_payables_status ON payables(status);
CREATE INDEX IF NOT EXISTS idx_payables_supplier ON payables(supplier_id);
"#;

const MIGRATION_004_AUDIT: &str = r#"
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    machine_name TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_at);
"#;

const MIGRATION_005_CLOSURES: &str = r#"
CREATE TABLE IF NOT EXISTS period_closures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Abierto',
    closed_by INTEGER,
    closed_at TEXT,
    observations TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (closed_by) REFERENCES users(id),
    UNIQUE(month, year)
);
"#;

const MIGRATION_006_NUMBERING: &str = r#"
CREATE TABLE IF NOT EXISTS numbering_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    length INTEGER NOT NULL DEFAULT 6,
    current_number INTEGER NOT NULL DEFAULT 1,
    padding_char TEXT NOT NULL DEFAULT '0',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT OR IGNORE INTO numbering_sequences (module, prefix, current_number) VALUES
  ('ventas', 'FV-', 1),
  ('cotizaciones', 'COT-', 1),
  ('compras', 'COM-', 1),
  ('recibos', 'RC-', 1),
  ('egresos', 'EG-', 1);
"#;

/// Migración 007 (v2.1): Timestamps universales + Soft Delete + Multi-tenancy
/// Se ejecuta mediante ALTERs seguros que ignoran columnas duplicadas.
const MIGRATION_007_AUDIT_SCHEMA: &str = r#"
-- ============================================================
-- MIGRACIÓN 007: Auditoría, Soft Delete y Multi-tenancy
-- ============================================================

-- 1. Tabla de empresas (preparación multi-tenancy)
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nit TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    deleted_at TEXT
);
INSERT OR IGNORE INTO companies (id, name, nit) VALUES (1, 'Empresa Principal', '000000000-0');

-- 2. Índices de rendimiento para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(active);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date ON inventory_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_receivables_customer ON receivables(customer_id);
CREATE INDEX IF NOT EXISTS idx_receivables_status ON receivables(status);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON payroll_entries(period);
CREATE INDEX IF NOT EXISTS idx_physical_counts_status ON physical_counts(status);
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_recovery_migration_creates_answer_and_attempt_tables() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE users (id INTEGER PRIMARY KEY);")
            .unwrap();
        execute_migration_batch(&conn, MIGRATION_009_PASSWORD_RECOVERY).unwrap();
        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_schema
                 WHERE type = 'table' AND name IN (
                    'password_recovery_answers',
                    'password_recovery_attempts'
                 )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 2);
    }

    #[test]
    fn legal_acceptance_migration_creates_versioned_receipt_table() {
        let conn = Connection::open_in_memory().unwrap();
        execute_migration_batch(&conn, MIGRATION_010_LEGAL_ACCEPTANCES).unwrap();
        let columns: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('legal_acceptances')
                 WHERE name IN (
                    'document_type',
                    'document_version',
                    'accepted_at',
                    'app_version',
                    'acceptance_method'
                 )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(columns, 5);
    }

    #[test]
    fn personal_data_migration_creates_indexed_subject_history() {
        let conn = Connection::open_in_memory().unwrap();
        execute_migration_batch(&conn, MIGRATION_011_PERSONAL_DATA_RECORDS).unwrap();

        let column_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('personal_data_processing_records')
                 WHERE name IN ('subject_type', 'subject_id', 'basis', 'purpose',
                    'effective_date', 'evidence_method', 'evidence_reference',
                    'recorded_at', 'recorded_by_user_id', 'recorded_by_name')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(column_count, 10);

        let index_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'index' AND name = 'idx_personal_data_records_subject'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(index_exists, 1);
    }

    #[test]
    fn security_metadata_mac_detects_salt_tampering() {
        let key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let salt = [3_u8; 16];
        let metadata = SecurityMetadata {
            version: 1,
            kdf: "argon2id-v1".to_string(),
            salt_hex: hex::encode(salt),
            mac_hex: metadata_mac(key, &salt).unwrap(),
        };
        assert!(verify_metadata_key(&metadata, key).is_ok());

        let mut tampered = metadata;
        tampered.salt_hex = hex::encode([4_u8; 16]);
        assert!(verify_metadata_key(&tampered, key).is_err());
    }

    #[test]
    fn plaintext_export_produces_a_real_sqlcipher_database() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let source_path = std::env::temp_dir().join(format!(
            "gestaerp-plain-export-{}-{}.db",
            std::process::id(),
            unique
        ));
        let encrypted_path = source_path.with_extension("encrypted.db");
        let key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let source = Connection::open(&source_path).unwrap();
        source
            .execute_batch("CREATE TABLE payload (value TEXT NOT NULL); INSERT INTO payload VALUES ('preserved');")
            .unwrap();

        export_to_sqlcipher(&source, &encrypted_path, key).unwrap();
        drop(source);
        let encrypted = open_cipher_database(&encrypted_path, key).unwrap();
        let value: String = encrypted
            .query_row("SELECT value FROM payload", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "preserved");
        assert!(open_cipher_database(&encrypted_path, "f".repeat(64).as_str()).is_err());
        drop(encrypted);

        let bytes = std::fs::read(&encrypted_path).unwrap();
        assert_ne!(&bytes[..16], b"SQLite format 3\0");
        let _ = std::fs::remove_file(source_path);
        let _ = std::fs::remove_file(&encrypted_path);
    }

    #[test]
    fn sync_queue_is_idempotent_and_tracks_retry_and_success() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sync_queue (
                id INTEGER PRIMARY KEY,
                backup_filename TEXT UNIQUE,
                sha256 TEXT,
                status TEXT DEFAULT 'pending',
                attempts INTEGER DEFAULT 0,
                next_attempt_at TEXT DEFAULT (datetime('now','localtime')),
                last_error TEXT,
                created_at TEXT DEFAULT (datetime('now','localtime')),
                synced_at TEXT
            );",
        )
        .unwrap();
        enqueue_backup(&conn, "backup.gbackup", &"a".repeat(64)).unwrap();
        enqueue_backup(&conn, "backup.gbackup", &"b".repeat(64)).unwrap();
        assert_eq!(pending_backups(&conn, 20).unwrap().len(), 1);

        mark_backup_retry(&conn, "backup.gbackup", "offline").unwrap();
        let attempts: i64 = conn
            .query_row(
                "SELECT attempts FROM sync_queue WHERE backup_filename = 'backup.gbackup'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(attempts, 1);
        assert!(pending_backups(&conn, 20).unwrap().is_empty());
        mark_backup_uploaded(&conn, "backup.gbackup").unwrap();
        assert_eq!(backup_sync_status(&conn).unwrap(), (0, 1));
    }

    #[test]
    fn connection_configuration_enables_foreign_keys_and_cache() {
        let conn = Connection::open_in_memory().unwrap();
        configure_connection(&conn).unwrap();

        let foreign_keys: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        let cache_size: i64 = conn
            .query_row("PRAGMA cache_size", [], |row| row.get(0))
            .unwrap();
        let synchronous: i64 = conn
            .query_row("PRAGMA synchronous", [], |row| row.get(0))
            .unwrap();

        assert_eq!(foreign_keys, 1);
        assert_eq!(cache_size, -32_000);
        assert_eq!(synchronous, 1);
    }

    #[test]
    fn disk_connection_enables_wal() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!(
            "gestaerp-wal-test-{}-{}.db",
            std::process::id(),
            unique
        ));
        let conn = Connection::open(&db_path).unwrap();
        configure_connection(&conn).unwrap();
        enable_wal(&conn).unwrap();

        let journal_mode: String = conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        assert_eq!(journal_mode.to_ascii_lowercase(), "wal");
        drop(conn);
        let _ = std::fs::remove_file(&db_path);
        let _ = std::fs::remove_file(db_path.with_extension("db-wal"));
        let _ = std::fs::remove_file(db_path.with_extension("db-shm"));
    }

    #[test]
    fn recent_daily_sales_are_aggregated_and_chronological() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE sales (created_at TEXT NOT NULL, total REAL NOT NULL)")
            .unwrap();

        let today = Local::now().date_naive();
        let today_at = format!("{} 10:00:00", today.format("%Y-%m-%d"));
        let yesterday_at = format!(
            "{} 10:00:00",
            (today - ChronoDuration::days(1)).format("%Y-%m-%d")
        );
        let two_days_ago_at = format!(
            "{} 10:00:00",
            (today - ChronoDuration::days(2)).format("%Y-%m-%d")
        );
        conn.execute(
            "INSERT INTO sales (created_at, total) VALUES (?1, 10), (?1, 20), (?2, 5), (?3, 7)",
            params![today_at, yesterday_at, two_days_ago_at],
        )
        .unwrap();

        assert_eq!(
            sales_for_recent_days(&conn, 3).unwrap(),
            vec![7.0, 5.0, 30.0]
        );
    }

    #[test]
    fn recent_monthly_sales_are_aggregated_newest_first() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE sales (created_at TEXT NOT NULL, total REAL NOT NULL)")
            .unwrap();

        let current_month = Local::now().date_naive().with_day(1).unwrap();
        let current_month_sale = format!("{} 10:00:00", Local::now().format("%Y-%m-%d"));
        let previous_month_sale = format!(
            "{} 10:00:00",
            current_month
                .checked_sub_months(Months::new(1))
                .unwrap()
                .format("%Y-%m-%d")
        );
        conn.execute(
            "INSERT INTO sales (created_at, total) VALUES (?1, 10), (?2, 5)",
            params![current_month_sale, previous_month_sale],
        )
        .unwrap();

        let months = sales_for_recent_months(&conn, 3).unwrap();
        assert_eq!(months.len(), 3);
        assert_eq!(months[0].0, current_month.format("%Y-%m").to_string());
        assert_eq!(months[0].1, 10.0);
        assert_eq!(
            months[1].0,
            current_month
                .checked_sub_months(Months::new(1))
                .unwrap()
                .format("%Y-%m")
                .to_string()
        );
        assert_eq!(months[1].1, 5.0);
        assert_eq!(months[2].1, 0.0);
    }
}
