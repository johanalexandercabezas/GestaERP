use crate::auth_guard;
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub new_version: String,
    pub applied: bool,
    pub backup_path: Option<String>,
    pub message: String,
}

/// Recibe una ruta a un nuevo .exe, hace backup de la BD y reemplaza el ejecutable.
/// El reemplazo efectivo ocurre al cerrar la app mediante un script batch auxiliar.
#[tauri::command]
pub fn apply_update(
    state: State<AppState>,
    new_exe_path: String,
    new_version: String,
) -> Result<UpdateInfo, String> {
    auth_guard::require_admin(&state)?;

    // 1. Verificar que el archivo existe
    let new_exe = std::path::PathBuf::from(&new_exe_path);
    if !new_exe.exists() {
        return Err("El archivo de actualización no existe en la ruta especificada".to_string());
    }
    if !new_exe_path.to_lowercase().ends_with(".exe") {
        return Err("El archivo debe ser un ejecutable (.exe)".to_string());
    }

    // 2. Backup de la base de datos antes de actualizar
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let data_dir = dirs::data_dir().ok_or("No se encontró el directorio de datos")?;
    let db_path = data_dir.join("GestaERP").join("gestaerp.db");
    let backup_dir = data_dir.join("GestaERP").join("backups").join("pre_update");
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Error creando directorio de backup: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("gestaerp_backup_pre_{}.db", timestamp);
    let backup_path = backup_dir.join(&backup_filename);

    // Copiar la BD si existe
    if db_path.exists() {
        std::fs::copy(&db_path, &backup_path)
            .map_err(|e| format!("Error haciendo backup de la BD: {}", e))?;
    }
    drop(conn); // Liberar el lock

    // 3. Obtener ruta del ejecutable actual
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Error obteniendo ruta del ejecutable actual: {}", e))?;
    let current_dir = current_exe
        .parent()
        .ok_or("No se pudo determinar el directorio de la aplicación")?;

    // 4. Crear script batch que reemplace el .exe al salir
    let batch_path = current_dir.join("update_gestaerp.bat");
    let batch_content = format!(
        "@echo off\r\n\
         echo Esperando a que GestaERP se cierre...\r\n\
         timeout /t 3 /nobreak >nul\r\n\
         echo Reemplazando GestaERP.exe...\r\n\
         move /Y \"{}\" \"{}\"\r\n\
         if %errorlevel% equ 0 (\r\n\
             echo Actualizacion completada exitosamente.\r\n\
             echo Iniciando nueva version...\r\n\
             start \"\" \"{}\"\r\n\
         ) else (\r\n\
             echo ERROR: No se pudo reemplazar el ejecutable.\r\n\
             echo Verifique que la aplicacion este cerrada.\r\n\
             pause\r\n\
         )\r\n\
         del \"%~f0\"\r\n",
        new_exe.display(),
        current_exe.display(),
        current_exe.display()
    );

    std::fs::write(&batch_path, batch_content)
        .map_err(|e| format!("Error creando script de actualización: {}", e))?;

    // 5. Ejecutar el batch (se ejecutará cuando la app se cierre)
    let _ = std::process::Command::new("cmd")
        .args(["/C", "start", "cmd", "/C", &batch_path.to_string_lossy()])
        .spawn();

    // Registrar versión en config
    let conn2 = state.db.lock().map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn2, "app_version", &new_version).ok();

    Ok(UpdateInfo {
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        new_version,
        applied: true,
        backup_path: Some(backup_path.to_string_lossy().to_string()),
        message: "Actualización preparada. La aplicación se actualizará al cerrar.".to_string(),
    })
}

/// Obtiene la versión actual de la app
#[tauri::command]
pub fn get_app_version(state: State<AppState>) -> Result<String, String> {
    auth_guard::require_auth(&state)?;
    Ok(env!("CARGO_PKG_VERSION").to_string())
}
