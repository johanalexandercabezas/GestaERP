use chrono::Local;
use rusqlite::Connection;
use serde::Serialize;
use sha2::Digest;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;

const BACKUP_MAGIC: &[u8; 8] = b"GEBACK01";
const BACKUP_HEADER_LEN: u64 = 24;

#[derive(Serialize, Debug, Clone)]
pub struct BackupInfo {
    pub filename: String,
    pub created: String,
    pub size: u64,
    pub encrypted: bool,
}

#[cfg(test)]
fn db_path() -> String {
    let mut path = std::env::current_dir().unwrap();
    path.push("test_gestaerp.db");
    path.to_string_lossy().to_string()
}

#[cfg(not(test))]
fn backups_dir() -> String {
    dirs::data_dir()
        .map(|p| p.join("GestaERP").join("backups"))
        .unwrap_or_else(|| std::path::PathBuf::from("backups"))
        .to_string_lossy()
        .to_string()
}

/// P0-05 FIX: Valida que un nombre de archivo no contenga path traversal.
/// Solo permite nombres de archivo simples (sin separadores de ruta).
fn validate_backup_filename(filename: &str) -> Result<(), String> {
    let name = Path::new(filename);
    if filename.is_empty()
        || filename.len() > 128
        || name.components().count() != 1
        || !filename
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err("Nombre de archivo inválido para backup".to_string());
    }
    // Rechazar cualquier separador de ruta (Windows y Unix)
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Nombre de archivo no permitido".to_string());
    }
    Ok(())
}

pub(crate) fn extract_encrypted_snapshot(
    backup_path: &Path,
    snapshot_path: &Path,
) -> Result<[u8; 16], String> {
    let filename = backup_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Ruta del backup inválida.".to_string())?;
    validate_backup_filename(filename)?;
    if backup_path
        .extension()
        .and_then(|extension| extension.to_str())
        != Some("gbackup")
    {
        return Err("El archivo debe tener extensión .gbackup.".to_string());
    }
    let mut input =
        fs::File::open(backup_path).map_err(|e| format!("No se pudo abrir el backup: {e}"))?;
    let mut header = [0_u8; BACKUP_HEADER_LEN as usize];
    input
        .read_exact(&mut header)
        .map_err(|e| format!("El backup está truncado o tiene formato inválido: {e}"))?;
    if &header[..8] != BACKUP_MAGIC {
        return Err("El archivo no tiene el formato cifrado de backup GestaERP.".to_string());
    }
    let salt: [u8; 16] = header[8..]
        .try_into()
        .map_err(|_| "La sal del backup tiene longitud inválida.".to_string())?;
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(snapshot_path)
        .map_err(|e| format!("No se pudo crear el snapshot temporal: {e}"))?;
    std::io::copy(&mut input, &mut output)
        .map_err(|e| format!("No se pudo extraer el snapshot cifrado: {e}"))?;
    output
        .sync_all()
        .map_err(|e| format!("No se pudo sincronizar el snapshot temporal: {e}"))?;
    Ok(salt)
}

pub fn backup_file_path(filename: &str) -> Result<std::path::PathBuf, String> {
    validate_backup_filename(filename)?;
    if Path::new(filename)
        .extension()
        .and_then(|extension| extension.to_str())
        != Some("gbackup")
    {
        return Err("El nombre no corresponde a un backup cifrado .gbackup.".to_string());
    }
    Ok(Path::new(&backups_dir()).join(filename))
}

pub fn validate_portable_backup(path: &Path) -> std::result::Result<(), String> {
    let mut file = fs::File::open(path).map_err(|e| format!("No se pudo abrir el backup: {e}"))?;
    let mut header = [0_u8; BACKUP_HEADER_LEN as usize];
    file.read_exact(&mut header)
        .map_err(|e| format!("El backup está truncado: {e}"))?;
    if &header[..8] != BACKUP_MAGIC {
        return Err("El archivo no tiene formato GestaERP cifrado.".to_string());
    }
    Ok(())
}

#[cfg(test)]
fn backups_dir() -> String {
    let mut path = std::env::current_dir().unwrap();
    path.push("test_backups");
    path.to_string_lossy().to_string()
}

pub fn create_backup(source: &Connection) -> Result<BackupInfo, String> {
    let (key, salt) = crate::db::active_backup_material()?;
    create_backup_with_material(source, key.as_str(), &salt)
}

fn create_backup_with_material(
    source: &Connection,
    key: &str,
    salt: &[u8; 16],
) -> Result<BackupInfo, String> {
    eprintln!("[BACKUP] Iniciando creación de backup...");

    let dir_str = backups_dir();
    let dir = Path::new(&dir_str);
    fs::create_dir_all(dir).map_err(|e| {
        eprintln!("[BACKUP] Error al crear carpeta: {}", e);
        format!("No se pudo crear la carpeta de backups: {}", e)
    })?;

    let now = Local::now().format("%Y%m%d_%H%M%S_%f").to_string();
    let filename = format!("gestaerp_{}.gbackup", now);
    let dest = dir.join(&filename);
    let snapshot = dir.join(format!(".{}.snapshot.tmp", filename));
    let temp = dir.join(format!(".{}.tmp", filename));

    let backup_result = (|| {
        crate::db::export_to_sqlcipher(source, &snapshot, key)?;
        let mut source_file = fs::File::open(&snapshot)
            .map_err(|e| format!("No se pudo leer el snapshot cifrado: {e}"))?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|e| format!("No se pudo crear el archivo temporal de backup: {e}"))?;
        output
            .write_all(BACKUP_MAGIC)
            .and_then(|_| output.write_all(salt))
            .map_err(|e| format!("No se pudo escribir la cabecera cifrada: {e}"))?;
        std::io::copy(&mut source_file, &mut output)
            .map_err(|e| format!("No se pudo guardar el snapshot cifrado: {e}"))?;
        output
            .sync_all()
            .map_err(|e| format!("No se pudo sincronizar el backup: {e}"))?;
        drop(output);
        fs::rename(&temp, &dest)
            .map_err(|e| format!("No se pudo publicar el backup completo: {e}"))?;
        fs::remove_file(&snapshot).map_err(|e| {
            format!("El backup se publicó, pero no se pudo limpiar el snapshot temporal: {e}")
        })?;
        Ok::<(), String>(())
    })();

    if let Err(error) = backup_result {
        let _ = fs::remove_file(&temp);
        let _ = fs::remove_file(&snapshot);
        eprintln!("[BACKUP] {}", error);
        return Err(error);
    }

    let metadata =
        fs::metadata(&dest).map_err(|e| format!("Error al leer metadatos del backup: {}", e))?;

    let backup = BackupInfo {
        filename,
        created: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        size: metadata.len(),
        encrypted: true,
    };
    let mut file = fs::File::open(&dest)
        .map_err(|e| format!("No se pudo abrir el backup para calcular su huella: {e}"))?;
    let mut digest = sha2::Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|e| format!("No se pudo calcular la huella del backup: {e}"))?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    crate::db::enqueue_backup(source, &backup.filename, &hex::encode(digest.finalize())).map_err(
        |e| {
            format!(
                "El backup se guardó localmente, pero no se pudo encolar para sincronización: {e}"
            )
        },
    )?;
    eprintln!("[BACKUP] Backup creado exitosamente: {:?}", backup);
    Ok(backup)
}

pub fn list_backups() -> Result<Vec<BackupInfo>, String> {
    eprintln!("[BACKUP] Listando backups...");
    let dir_str = backups_dir();
    let dir = Path::new(&dir_str);
    if !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear carpeta: {}", e))?;
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    let entries =
        fs::read_dir(dir).map_err(|e| format!("No se pudo leer la carpeta de backups: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Error al leer entrada: {}", e))?;
        let path = entry.path();
        if path.is_file()
            && path
                .extension()
                .map(|extension| extension == "gbackup" || extension == "db")
                .unwrap_or(false)
        {
            let encrypted = path
                .extension()
                .map(|extension| extension == "gbackup")
                .unwrap_or(false);
            let metadata = fs::metadata(&path).ok();
            let created = metadata
                .as_ref()
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    let datetime: chrono::DateTime<Local> = t.into();
                    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
                })
                .unwrap_or_else(|| "Desconocido".to_string());
            let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
            backups.push(BackupInfo {
                filename: path.file_name().unwrap().to_string_lossy().to_string(),
                created,
                size,
                encrypted,
            });
        }
    }

    backups.sort_by(|a, b| b.filename.cmp(&a.filename));
    eprintln!("[BACKUP] {} backups encontrados", backups.len());
    Ok(backups)
}

pub fn restore_backup(filename: &str, destination: &mut Connection) -> Result<(), String> {
    let (key, salt) = crate::db::active_backup_material()?;
    restore_backup_with_material(filename, destination, key.as_str(), &salt)
}

fn restore_backup_with_material(
    filename: &str,
    destination: &mut Connection,
    key: &str,
    salt: &[u8; 16],
) -> Result<(), String> {
    validate_backup_filename(filename)?;
    eprintln!("[BACKUP] Restaurando backup: {}", filename);
    let dir_str = backups_dir();
    let dir = Path::new(&dir_str);
    let src = dir.join(filename);
    if !src.exists() {
        return Err("El archivo de backup no existe.".to_string());
    }

    let mut file = fs::File::open(&src)
        .map_err(|e| format!("No se pudo abrir el backup seleccionado: {e}"))?;
    let mut header = [0_u8; BACKUP_HEADER_LEN as usize];
    file.read_exact(&mut header)
        .map_err(|e| format!("El backup está truncado o tiene formato inválido: {e}"))?;
    if &header[..8] != BACKUP_MAGIC {
        return Err("El archivo no tiene el formato cifrado de backup GestaERP.".to_string());
    }
    if &header[8..] != salt {
        return Err(
            "Este backup usa otra frase de recuperación; no se modificó la base actual."
                .to_string(),
        );
    }

    let snapshot = src.with_extension(format!("restore.{}.tmp", std::process::id()));
    let mut snapshot_file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&snapshot)
        .map_err(|e| format!("No se pudo crear el archivo temporal de restauración: {e}"))?;
    std::io::copy(&mut file, &mut snapshot_file)
        .map_err(|e| format!("No se pudo extraer el snapshot cifrado: {e}"))?;
    snapshot_file
        .sync_all()
        .map_err(|e| format!("No se pudo sincronizar el snapshot: {e}"))?;
    drop(snapshot_file);
    let source = match crate::db::open_cipher_file(&snapshot, key) {
        Ok(source) => source,
        Err(error) => {
            fs::remove_file(&snapshot)
                .map_err(|e| format!("{error}; tampoco se pudo limpiar el snapshot: {e}"))?;
            return Err(error);
        }
    };
    let integrity: String = match source.query_row("PRAGMA integrity_check", [], |row| row.get(0)) {
        Ok(integrity) => integrity,
        Err(error) => {
            drop(source);
            fs::remove_file(&snapshot).map_err(|e| {
                format!("No se pudo validar el backup ({error}) ni limpiar snapshot: {e}")
            })?;
            return Err(format!("No se pudo validar el backup: {error}"));
        }
    };
    if integrity != "ok" {
        drop(source);
        fs::remove_file(&snapshot)
            .map_err(|e| format!("No se pudo limpiar el snapshot inválido: {e}"))?;
        return Err(format!(
            "El backup no superó la validación de integridad: {}",
            integrity
        ));
    }

    drop(source);
    let restore_result = restore_snapshot(&snapshot, destination, key);
    let cleanup_result = fs::remove_file(&snapshot)
        .map_err(|e| format!("No se pudo limpiar el snapshot tras restaurarlo: {e}"));
    restore_result?;
    cleanup_result?;

    eprintln!("[BACKUP] Backup restaurado en la conexión activa.");
    Ok(())
}

fn restore_snapshot(
    snapshot_path: &Path,
    destination: &mut Connection,
    key: &str,
) -> Result<(), String> {
    let snapshot_path = snapshot_path.to_string_lossy().replace('\'', "''");
    destination
        .execute_batch(&format!(
            "ATTACH DATABASE '{snapshot_path}' AS restore_source KEY \"x'{key}'\";"
        ))
        .map_err(|e| format!("No se pudo adjuntar el snapshot SQLCipher: {e}"))?;
    let restore_result = (|| {
        destination
            .execute_batch("PRAGMA foreign_keys = OFF;")
            .map_err(|e| format!("No se pudieron suspender las claves foráneas: {e}"))?;
        let transaction = destination
            .transaction()
            .map_err(|e| format!("No se pudo iniciar la transacción de restauración: {e}"))?;
        let objects = {
            let mut statement = transaction
                .prepare(
                    "SELECT type, name FROM main.sqlite_schema
                     WHERE type IN ('trigger', 'view', 'table')
                       AND name NOT LIKE 'sqlite_%'
                     ORDER BY CASE type
                         WHEN 'trigger' THEN 0
                         WHEN 'view' THEN 1
                         ELSE 2
                     END",
                )
                .map_err(|e| format!("No se pudo inspeccionar el esquema existente: {e}"))?;
            let rows = statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| format!("No se pudo enumerar el esquema existente: {e}"))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| format!("No se pudo leer el esquema existente: {e}"))?
        };
        for (object_type, name) in objects {
            let quoted_name = name.replace('"', "\"\"");
            transaction
                .execute_batch(&format!("DROP {object_type} \"{quoted_name}\";"))
                .map_err(|e| format!("No se pudo reemplazar el objeto {name}: {e}"))?;
        }
        transaction
            .query_row(
                "SELECT sqlcipher_export('main', 'restore_source')",
                [],
                |_| Ok(()),
            )
            .map_err(|e| format!("No se pudo restaurar el snapshot SQLCipher: {e}"))?;
        transaction
            .commit()
            .map_err(|e| format!("No se pudo confirmar la restauración: {e}"))
    })();
    let foreign_keys_result = destination.execute_batch("PRAGMA foreign_keys = ON;");
    let detach_result = destination.execute_batch("DETACH DATABASE restore_source;");
    let mut errors = Vec::new();
    if let Err(error) = restore_result {
        errors.push(error);
    }
    if let Err(error) = foreign_keys_result {
        errors.push(format!(
            "No se pudieron reactivar las claves foráneas: {error}"
        ));
    }
    if let Err(error) = detach_result {
        errors.push(format!("No se pudo cerrar el snapshot SQLCipher: {error}"));
    }
    if !errors.is_empty() {
        return Err(errors.join("; "));
    }
    Ok(())
}

pub fn delete_backup(filename: &str) -> Result<(), String> {
    validate_backup_filename(filename)?;
    eprintln!("[BACKUP] Eliminando backup: {}", filename);
    let dir_str = backups_dir();
    let dir = Path::new(&dir_str);
    let path = dir.join(filename);
    if !path.exists() {
        return Err("El archivo de backup no existe.".to_string());
    }
    fs::remove_file(&path).map_err(|e| format!("Error al eliminar backup: {}", e))?;
    Ok(())
}

/// Exporta un backup al Escritorio (o ruta especificada) para migración a otro PC
pub fn export_backup_to_path(filename: &str, dest_path: &str) -> Result<BackupInfo, String> {
    validate_backup_filename(filename)?;
    eprintln!(
        "[BACKUP] Exportando backup {} hacia {}",
        filename, dest_path
    );
    let backups = list_backups()?;
    let found = backups
        .iter()
        .find(|b| b.filename == filename)
        .ok_or_else(|| "Backup no encontrado".to_string())?;
    if !found.encrypted {
        return Err(
            "El backup antiguo no está cifrado y no se puede exportar de forma segura.".to_string(),
        );
    }

    let dir_str = backups_dir();
    let dir = Path::new(&dir_str);
    let src = dir.join(filename);
    let dest = Path::new(dest_path).join(filename);

    fs::copy(&src, &dest).map_err(|e| format!("Error al exportar backup: {}", e))?;

    Ok(BackupInfo {
        filename: found.filename.clone(),
        created: found.created.clone(),
        size: found.size,
        encrypted: found.encrypted,
    })
}

/// Importa un backup desde una ruta externa (ej. USB, Escritorio) y lo copia a la carpeta de backups
pub fn import_backup_from_path(source_path: &str) -> Result<BackupInfo, String> {
    eprintln!("[BACKUP] Importando backup desde: {}", source_path);
    let src = Path::new(source_path);
    if !src.exists() {
        return Err("El archivo especificado no existe.".to_string());
    }

    let filename = src
        .file_name()
        .ok_or_else(|| "Nombre de archivo inválido".to_string())?
        .to_string_lossy()
        .to_string();
    validate_backup_filename(&filename)?;
    if Path::new(&filename)
        .extension()
        .and_then(|extension| extension.to_str())
        != Some("gbackup")
    {
        return Err("Solo se pueden importar backups GestaERP cifrados (.gbackup).".to_string());
    }
    let mut source =
        fs::File::open(src).map_err(|e| format!("No se pudo abrir el archivo a importar: {e}"))?;
    let mut header = [0_u8; BACKUP_HEADER_LEN as usize];
    source
        .read_exact(&mut header)
        .map_err(|e| format!("El archivo no es un backup válido o está truncado: {e}"))?;
    if &header[..8] != BACKUP_MAGIC {
        return Err("El archivo no tiene el formato cifrado de backup GestaERP.".to_string());
    }

    let dir_str = backups_dir();
    let dir = Path::new(&dir_str);
    fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear carpeta de backups: {}", e))?;
    let dest = dir.join(&filename);

    let temp = dir.join(format!(".{}.{}.tmp", filename, std::process::id()));
    fs::copy(src, &temp).map_err(|e| format!("Error al copiar el backup cifrado: {}", e))?;
    fs::rename(&temp, &dest)
        .map_err(|e| format!("Error al publicar el backup importado: {}", e))?;

    let metadata = fs::metadata(&dest).map_err(|e| format!("Error al leer metadatos: {}", e))?;

    Ok(BackupInfo {
        filename,
        created: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        size: metadata.len(),
        encrypted: true,
    })
}

/// Abre la carpeta de backups en el explorador de archivos
pub fn open_backups_folder() -> Result<(), String> {
    let dir_str = backups_dir();
    let dir = Path::new(&dir_str);
    fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear carpeta: {}", e))?;

    open::that(dir).map_err(|e| format!("No se pudo abrir la carpeta: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Seek;
    use std::path::Path;

    fn cleanup() {
        let db = db_path();
        let dir = backups_dir();
        if Path::new(&db).exists() {
            let _ = fs::remove_file(&db);
        }
        if Path::new(&dir).exists() {
            let _ = fs::remove_dir_all(&dir);
        }
    }

    #[test]
    fn test_backup_flow() {
        cleanup();

        let key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let salt = [7_u8; 16];
        let db = db_path();
        let mut connection = Connection::open(&db).unwrap();
        let journal_mode: String = connection
            .query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))
            .unwrap();
        assert_eq!(journal_mode.to_ascii_lowercase(), "wal");
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                CREATE TABLE backup_test (value TEXT NOT NULL);
                CREATE TABLE sync_queue (
                    id INTEGER PRIMARY KEY,
                    backup_filename TEXT UNIQUE,
                    sha256 TEXT,
                    status TEXT DEFAULT 'pending',
                    attempts INTEGER DEFAULT 0,
                    next_attempt_at TEXT DEFAULT (datetime('now','localtime')),
                    last_error TEXT,
                    created_at TEXT DEFAULT (datetime('now','localtime')),
                    synced_at TEXT
                );
                INSERT INTO backup_test VALUES ('original');",
            )
            .unwrap();

        // Create backup
        let backup_info = create_backup_with_material(&connection, key, &salt).unwrap();
        assert!(backup_info.filename.starts_with("gestaerp_"));
        assert!(backup_info.size > 0);
        let mut backup_header = [0_u8; BACKUP_HEADER_LEN as usize];
        fs::File::open(Path::new(&backups_dir()).join(&backup_info.filename))
            .unwrap()
            .read_exact(&mut backup_header)
            .unwrap();
        assert_eq!(&backup_header[..8], BACKUP_MAGIC);
        assert_eq!(&backup_header[8..], &salt);
        let mut encrypted_header = [0_u8; 16];
        let mut backup_file =
            fs::File::open(Path::new(&backups_dir()).join(&backup_info.filename)).unwrap();
        backup_file
            .seek(std::io::SeekFrom::Start(BACKUP_HEADER_LEN))
            .unwrap();
        backup_file.read_exact(&mut encrypted_header).unwrap();
        assert_ne!(&encrypted_header, b"SQLite format 3\0");

        // List backups
        let list = list_backups().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].filename, backup_info.filename);

        // Restore the snapshot into the live connection without replacing its open file.
        connection
            .execute("UPDATE backup_test SET value = 'modified'", [])
            .unwrap();
        connection
            .execute("INSERT INTO backup_test VALUES ('committed in WAL')", [])
            .unwrap();
        assert!(restore_backup_with_material(
            &backup_info.filename,
            &mut connection,
            key,
            &[8_u8; 16]
        )
        .is_err());
        restore_backup_with_material(&backup_info.filename, &mut connection, key, &salt).unwrap();
        let restored_rows: Vec<String> = connection
            .prepare("SELECT value FROM backup_test ORDER BY rowid")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(
            restored_rows,
            vec!["original".to_string()],
            "restore must replace data committed to WAL after the snapshot"
        );
        let foreign_keys: i64 = connection
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_keys, 1);

        // Delete backup
        delete_backup(&backup_info.filename).unwrap();
        let list_after = list_backups().unwrap();
        assert!(list_after.is_empty());

        drop(connection);
        cleanup();
    }
}
