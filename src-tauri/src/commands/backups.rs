use crate::auth_guard;
use crate::backup;
use crate::AppState;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::path::Path;
use std::time::Duration;
use tauri::State;
use tokio::io::AsyncWriteExt;

#[derive(Serialize)]
pub struct BackupSyncResult {
    pub uploaded: usize,
    pub pending: i64,
    pub errors: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct RemoteBackupInfo {
    pub filename: String,
    pub created: String,
    pub size: u64,
    pub sha256: String,
}

#[tauri::command]
pub fn create_backup(state: State<AppState>) -> Result<backup::BackupInfo, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    backup::create_backup(&conn)
}

#[tauri::command]
pub fn list_backups(state: State<AppState>) -> Result<Vec<backup::BackupInfo>, String> {
    auth_guard::require_auth(&state)?;
    backup::list_backups()
}

#[tauri::command]
pub fn restore_backup(state: State<AppState>, filename: String) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    backup::restore_backup(&filename, &mut conn)
}

#[tauri::command]
pub fn delete_backup(state: State<AppState>, filename: String) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    backup::delete_backup(&filename)
}

#[tauri::command]
pub fn export_backup(
    state: State<AppState>,
    filename: String,
    dest_path: String,
) -> Result<backup::BackupInfo, String> {
    auth_guard::require_admin(&state)?;
    backup::export_backup_to_path(&filename, &dest_path)
}

#[tauri::command]
pub fn import_backup(
    state: State<AppState>,
    source_path: String,
) -> Result<backup::BackupInfo, String> {
    auth_guard::require_admin(&state)?;
    backup::import_backup_from_path(&source_path)
}

#[tauri::command]
pub fn open_backups_folder(state: State<AppState>) -> Result<(), String> {
    auth_guard::require_auth(&state)?;
    backup::open_backups_folder()
}

#[tauri::command]
pub fn get_backup_sync_status(state: State<AppState>) -> Result<(i64, i64, bool), String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let (pending, uploaded) = crate::db::backup_sync_status(&conn).map_err(|e| e.to_string())?;
    let configured = crate::db::get_setting(&conn, "backup_sync_endpoint").is_some()
        && crate::db::backup_sync_token()?.is_some();
    Ok((pending, uploaded, configured))
}

#[tauri::command]
pub async fn sync_backups(state: State<'_, AppState>) -> Result<BackupSyncResult, String> {
    auth_guard::require_auth(&state)?;
    let (endpoint, backups) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let endpoint = crate::db::get_setting(&conn, "backup_sync_endpoint")
            .ok_or_else(|| "Configura primero el endpoint remoto de backups.".to_string())?;
        (
            endpoint,
            crate::db::pending_backups(&conn, 20).map_err(|e| e.to_string())?,
        )
    };
    if backups.is_empty() {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let (pending, _) = crate::db::backup_sync_status(&conn).map_err(|e| e.to_string())?;
        return Ok(BackupSyncResult {
            uploaded: 0,
            pending,
            errors: Vec::new(),
        });
    }
    let token = crate::db::backup_sync_token()?
        .ok_or_else(|| "Configura un token de acceso para el servicio remoto.".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30 * 60))
        .build()
        .map_err(|e| format!("No se pudo crear el cliente HTTP: {e}"))?;
    let upload_url = format!("{}/v1/backups", endpoint.trim_end_matches('/'));
    let mut uploaded = 0;
    let mut errors = Vec::new();

    for item in backups {
        let path = backup::backup_file_path(&item.filename)?;
        let file = match tokio::fs::File::open(&path).await {
            Ok(file) => file,
            Err(error) => {
                let conn = state.db.lock().map_err(|e| e.to_string())?;
                crate::db::mark_backup_retry(&conn, &item.filename, &error.to_string())
                    .map_err(|e| format!("No se pudo registrar el reintento: {e}"))?;
                errors.push(format!("{}: {error}", item.filename));
                continue;
            }
        };
        let body = reqwest::Body::wrap_stream(tokio_util::io::ReaderStream::new(file));
        let response = client
            .post(&upload_url)
            .bearer_auth(token.as_str())
            .header("Idempotency-Key", &item.filename)
            .header("X-GestaERP-Backup-SHA256", &item.sha256)
            .header("X-GestaERP-Backup-Format", "GEBACK01")
            .header("Content-Type", "application/octet-stream")
            .body(body)
            .send()
            .await;
        match response {
            Ok(response) if response.status().is_success() => {
                let conn = state.db.lock().map_err(|e| e.to_string())?;
                crate::db::mark_backup_uploaded(&conn, &item.filename)
                .map_err(|e| format!("El servidor aceptó el backup, pero no se pudo marcar como sincronizado: {e}"))?;
                uploaded += 1;
            }
            Ok(response) => {
                let error = format!("El servidor respondió HTTP {}", response.status());
                let conn = state.db.lock().map_err(|e| e.to_string())?;
                crate::db::mark_backup_retry(&conn, &item.filename, &error)
                    .map_err(|e| format!("No se pudo registrar el reintento: {e}"))?;
                errors.push(format!("{}: {error}", item.filename));
            }
            Err(error) => {
                let conn = state.db.lock().map_err(|e| e.to_string())?;
                crate::db::mark_backup_retry(&conn, &item.filename, &error.to_string())
                    .map_err(|e| format!("No se pudo registrar el reintento: {e}"))?;
                errors.push(format!("{}: {error}", item.filename));
            }
        }
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let (pending, _) = crate::db::backup_sync_status(&conn).map_err(|e| e.to_string())?;
    Ok(BackupSyncResult {
        uploaded,
        pending,
        errors,
    })
}

#[tauri::command]
pub async fn list_remote_backups(
    state: State<'_, AppState>,
) -> Result<Vec<RemoteBackupInfo>, String> {
    auth_guard::require_auth(&state)?;
    let endpoint = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        crate::db::get_setting(&conn, "backup_sync_endpoint")
            .ok_or_else(|| "Configura primero el endpoint remoto de backups.".to_string())?
    };
    let token = crate::db::backup_sync_token()?
        .ok_or_else(|| "Configura un token de acceso para el servicio remoto.".to_string())?;
    let response = reqwest::Client::new()
        .get(format!("{}/v1/backups", endpoint.trim_end_matches('/')))
        .bearer_auth(token.as_str())
        .send()
        .await
        .map_err(|e| format!("No se pudo consultar el servidor de backups: {e}"))?
        .error_for_status()
        .map_err(|e| format!("El servidor rechazó la consulta de backups: {e}"))?;
    response
        .json::<Vec<RemoteBackupInfo>>()
        .await
        .map_err(|e| format!("La respuesta remota de backups no es válida: {e}"))
}

#[tauri::command]
pub async fn download_remote_backup(
    state: State<'_, AppState>,
    filename: String,
    sha256: String,
) -> Result<backup::BackupInfo, String> {
    auth_guard::require_auth(&state)?;
    if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("La huella remota no tiene formato SHA-256.".to_string());
    }
    let destination = backup::backup_file_path(&filename)?;
    let endpoint = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        crate::db::get_setting(&conn, "backup_sync_endpoint")
            .ok_or_else(|| "Configura primero el endpoint remoto de backups.".to_string())?
    };
    let token = crate::db::backup_sync_token()?
        .ok_or_else(|| "Configura un token de acceso para el servicio remoto.".to_string())?;
    let response = reqwest::Client::new()
        .get(format!(
            "{}/v1/backups/{}",
            endpoint.trim_end_matches('/'),
            filename
        ))
        .bearer_auth(token.as_str())
        .send()
        .await
        .map_err(|e| format!("No se pudo descargar el backup: {e}"))?
        .error_for_status()
        .map_err(|e| format!("El servidor rechazó la descarga: {e}"))?;

    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("No se pudo crear la carpeta local de backups: {e}"))?;
    }
    let temp_path = destination.with_extension(format!("download.{}.tmp", std::process::id()));
    let mut output = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .await
        .map_err(|e| format!("No se pudo crear el archivo temporal: {e}"))?;
    let mut response = response;
    let transfer_result = async {
        let mut digest = sha2::Sha256::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("La descarga remota falló: {e}"))?
        {
            digest.update(&chunk);
            output
                .write_all(&chunk)
                .await
                .map_err(|e| format!("No se pudo guardar el backup descargado: {e}"))?;
        }
        output
            .sync_all()
            .await
            .map_err(|e| format!("No se pudo sincronizar el backup descargado: {e}"))?;
        Ok::<String, String>(hex::encode(digest.finalize()))
    }
    .await;
    drop(output);
    let actual_digest = match transfer_result {
        Ok(digest) => digest,
        Err(error) => {
            tokio::fs::remove_file(&temp_path)
                .await
                .map_err(|cleanup| {
                    format!("{error}; tampoco se pudo limpiar el temporal: {cleanup}")
                })?;
            return Err(error);
        }
    };
    if !actual_digest.eq_ignore_ascii_case(&sha256) {
        tokio::fs::remove_file(&temp_path)
            .await
            .map_err(|e| format!("La huella no coincide y no se pudo limpiar el temporal: {e}"))?;
        return Err(
            "La huella del backup descargado no coincide; el archivo se descartó.".to_string(),
        );
    }
    if let Err(error) = backup::validate_portable_backup(Path::new(&temp_path)) {
        tokio::fs::remove_file(&temp_path)
            .await
            .map_err(|e| format!("{error}; tampoco se pudo limpiar el temporal: {e}"))?;
        return Err(error);
    }
    if let Err(error) = tokio::fs::rename(&temp_path, &destination).await {
        tokio::fs::remove_file(&temp_path)
            .await
            .map_err(|cleanup| {
                format!("No se pudo instalar el backup ({error}) ni limpiar el temporal: {cleanup}")
            })?;
        return Err(format!("No se pudo instalar el backup descargado: {error}"));
    }
    let metadata = tokio::fs::metadata(&destination)
        .await
        .map_err(|e| format!("No se pudieron leer los metadatos del backup: {e}"))?;
    Ok(backup::BackupInfo {
        filename,
        created: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        size: metadata.len(),
        encrypted: true,
    })
}
