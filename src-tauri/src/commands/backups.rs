use tauri::State;
use crate::AppState;
use crate::auth_guard;
use crate::backup;

#[tauri::command]
pub fn create_backup(state: State<AppState>) -> Result<backup::BackupInfo, String> {
    auth_guard::require_auth(&state)?;
    backup::create_backup()
}

#[tauri::command]
pub fn list_backups(state: State<AppState>) -> Result<Vec<backup::BackupInfo>, String> {
    auth_guard::require_auth(&state)?;
    backup::list_backups()
}

#[tauri::command]
pub fn restore_backup(state: State<AppState>, filename: String) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    backup::restore_backup(&filename)
}

#[tauri::command]
pub fn delete_backup(state: State<AppState>, filename: String) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    backup::delete_backup(&filename)
}

#[tauri::command]
pub fn export_backup(state: State<AppState>, filename: String, dest_path: String) -> Result<backup::BackupInfo, String> {
    auth_guard::require_admin(&state)?;
    backup::export_backup_to_path(&filename, &dest_path)
}

#[tauri::command]
pub fn import_backup(state: State<AppState>, source_path: String) -> Result<backup::BackupInfo, String> {
    auth_guard::require_admin(&state)?;
    backup::import_backup_from_path(&source_path)
}

#[tauri::command]
pub fn open_backups_folder(state: State<AppState>) -> Result<(), String> {
    auth_guard::require_auth(&state)?;
    backup::open_backups_folder()
}
