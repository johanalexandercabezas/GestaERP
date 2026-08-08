//! Módulo de auditoría detallada
//! Registra automáticamente cada acción de usuario (crear, editar, eliminar)
//! en la tabla audit_logs con: usuario, acción, entidad, ID, valores, IP, timestamp.

use rusqlite::Connection;

/// Registra una acción de auditoría en la base de datos.
///
/// # Argumentos
/// * `conn` - Conexión a la base de datos
/// * `user_id` - ID del usuario que realizó la acción
/// * `username` - Nombre de usuario
/// * `table_name` - Tabla afectada (ej: "products", "sales", "employees")
/// * `record_id` - ID del registro afectado
/// * `action` - Acción realizada: "CREATE", "UPDATE", "DELETE"
/// * `old_values` - Valores anteriores (opcional, para UPDATE/DELETE)
/// * `new_values` - Nuevos valores (opcional, para CREATE/UPDATE)
pub fn log_action(
    conn: &Connection,
    user_id: i64,
    username: &str,
    table_name: &str,
    record_id: i64,
    action: &str,
    old_values: Option<&str>,
    new_values: Option<&str>,
) {
    let machine_name = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown".to_string());

    // No interrumpir la operación principal si falla el log
    let _ = conn.execute(
        "INSERT INTO audit_logs (user_id, username, table_name, record_id, action, old_values, new_values, machine_name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            user_id,
            username,
            table_name,
            record_id,
            action,
            old_values.unwrap_or(""),
            new_values.unwrap_or(""),
            machine_name,
        ],
    );
}

/// Helper para serializar un struct a JSON string para el log
pub fn to_json_string<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string())
}
