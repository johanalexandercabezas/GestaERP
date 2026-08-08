use chrono::Local;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize, Debug, Clone)]
pub struct BackupInfo {
    pub filename: String,
    pub created: String,
    pub size: u64,
}

#[cfg(not(test))]
fn db_path() -> String {
    dirs::data_dir()
        .map(|p| p.join("GestaERP").join("gestaerp.db"))
        .unwrap_or_else(|| std::path::PathBuf::from("gestaerp.db"))
        .to_string_lossy()
        .to_string()
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
    if name.components().count() != 1 {
        return Err("Nombre de archivo inválido para backup".to_string());
    }
    // Rechazar cualquier separador de ruta (Windows y Unix)
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Nombre de archivo no permitido".to_string());
    }
    // Rechazar caracteres peligrosos de Windows
    if filename
        .chars()
        .any(|c| matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
    {
        return Err("Nombre de archivo no permitido".to_string());
    }
    Ok(())
}

#[cfg(test)]
fn backups_dir() -> String {
    let mut path = std::env::current_dir().unwrap();
    path.push("test_backups");
    path.to_string_lossy().to_string()
}

pub fn create_backup() -> Result<BackupInfo, String> {
    eprintln!("[BACKUP] Iniciando creación de backup...");
    let db_path = db_path();
    eprintln!("[BACKUP] Ruta de BD: {}", db_path);

    let db = Path::new(&db_path);
    if !db.exists() {
        return Err(format!("La base de datos no existe en: {}", db_path));
    }

    let dir_str = backups_dir();
    let dir = Path::new(&dir_str);
    fs::create_dir_all(dir).map_err(|e| {
        eprintln!("[BACKUP] Error al crear carpeta: {}", e);
        format!("No se pudo crear la carpeta de backups: {}", e)
    })?;

    let now = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("gestaerp_{}.db", now);
    let dest = dir.join(&filename);

    fs::copy(db, &dest).map_err(|e| {
        eprintln!("[BACKUP] Error al copiar BD: {}", e);
        format!("Error al copiar la base de datos: {}", e)
    })?;

    let metadata = fs::metadata(&dest).map_err(|e| {
        eprintln!("[BACKUP] Error al leer metadatos: {}", e);
        format!("Error al leer metadatos del backup: {}", e)
    })?;

    let backup = BackupInfo {
        filename,
        created: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        size: metadata.len(),
    };
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
        if path.is_file() && path.extension().map(|e| e == "db").unwrap_or(false) {
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
            });
        }
    }

    backups.sort_by(|a, b| b.filename.cmp(&a.filename));
    eprintln!("[BACKUP] {} backups encontrados", backups.len());
    Ok(backups)
}

pub fn restore_backup(filename: &str) -> Result<(), String> {
    validate_backup_filename(filename)?;
    eprintln!("[BACKUP] Restaurando backup: {}", filename);
    let dir_str = backups_dir();
    let dir = Path::new(&dir_str);
    let src = dir.join(filename);
    if !src.exists() {
        return Err("El archivo de backup no existe.".to_string());
    }

    let db_path = db_path();
    fs::copy(&src, Path::new(&db_path)).map_err(|e| {
        eprintln!("[BACKUP] Error al restaurar: {}", e);
        format!("Error al restaurar el backup: {}", e)
    })?;

    eprintln!("[BACKUP] Backup restaurado exitosamente. Reinicia la aplicación.");
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

    let dir_str = backups_dir();
    let dir = Path::new(&dir_str);
    let src = dir.join(filename);
    let dest = Path::new(dest_path).join(filename);

    fs::copy(&src, &dest).map_err(|e| format!("Error al exportar backup: {}", e))?;

    Ok(BackupInfo {
        filename: found.filename.clone(),
        created: found.created.clone(),
        size: found.size,
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

    let dir_str = backups_dir();
    let dir = Path::new(&dir_str);
    fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear carpeta de backups: {}", e))?;
    let dest = dir.join(&filename);

    fs::copy(src, &dest).map_err(|e| format!("Error al importar backup: {}", e))?;

    let metadata = fs::metadata(&dest).map_err(|e| format!("Error al leer metadatos: {}", e))?;

    Ok(BackupInfo {
        filename,
        created: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        size: metadata.len(),
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

        let db = db_path();
        fs::write(&db, b"DUMMY DATABASE CONTENT").unwrap();

        // Create backup
        let backup_info = create_backup().unwrap();
        assert!(backup_info.filename.starts_with("gestaerp_"));
        assert_eq!(backup_info.size, 22);

        // List backups
        let list = list_backups().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].filename, backup_info.filename);

        // Restore backup
        fs::write(&db, b"MODIFIED CONTENT").unwrap();
        restore_backup(&backup_info.filename).unwrap();
        let restored_content = fs::read(&db).unwrap();
        assert_eq!(restored_content, b"DUMMY DATABASE CONTENT");

        // Delete backup
        delete_backup(&backup_info.filename).unwrap();
        let list_after = list_backups().unwrap();
        assert!(list_after.is_empty());

        cleanup();
    }
}
