use tauri::State;
use crate::AppState;
use crate::auth_guard;
use serde::{Deserialize, Serialize};

/// Fila de auditoría alineada con el schema REAL de MIGRATION_004:
/// audit_logs(id, user_id, username, table_name, record_id, action,
///            old_values, new_values, created_at, machine_name)
#[derive(Debug, Serialize, Deserialize)]
pub struct AuditLogRow {
    pub id: i64,
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub table_name: Option<String>,
    pub record_id: Option<i64>,
    pub action: String,
    pub old_values: Option<String>,
    pub new_values: Option<String>,
    pub created_at: String,
    pub machine_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditSummary {
    pub total_events: i64,
    pub today_events: i64,
    pub events_by_type: Vec<TypeCount>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TypeCount {
    pub action: String,
    pub count: i64,
}

/// P0-02 FIX: Filtros por tabla, entidad y acción alineados al schema real.
#[tauri::command]
pub fn get_audit_logs(
    state: State<AppState>,
    user_id: Option<i64>,
    table_name: Option<String>,
    action: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<AuditLogRow>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut conditions = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(uid) = user_id {
        conditions.push("l.user_id = ?".to_string());
        params.push(Box::new(uid));
    }
    if let Some(ref tn) = table_name {
        conditions.push("l.table_name = ?".to_string());
        params.push(Box::new(tn.clone()));
    }
    if let Some(ref act) = action {
        conditions.push("l.action = ?".to_string());
        params.push(Box::new(act.clone()));
    }
    if let Some(ref sd) = start_date {
        conditions.push("date(l.created_at) >= ?".to_string());
        params.push(Box::new(sd.clone()));
    }
    if let Some(ref ed) = end_date {
        conditions.push("date(l.created_at) <= ?".to_string());
        params.push(Box::new(ed.clone()));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let limit_val = limit.unwrap_or(100);
    let query = format!(
        "SELECT l.id, l.user_id, COALESCE(l.username, 'Desconocido') as username, \
         l.table_name, l.record_id, l.action, l.old_values, l.new_values, l.created_at, l.machine_name \
         FROM audit_logs l \
         {} ORDER BY l.created_at DESC LIMIT ?",
        where_clause
    );

    params.push(Box::new(limit_val));

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |row| {
        Ok(AuditLogRow {
            id: row.get(0)?,
            user_id: row.get(1)?,
            username: row.get(2)?,
            table_name: row.get(3)?,
            record_id: row.get(4)?,
            action: row.get(5)?,
            old_values: row.get(6)?,
            new_values: row.get(7)?,
            created_at: row.get(8)?,
            machine_name: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_audit_summary(state: State<AppState>) -> Result<AuditSummary, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let total_events: i64 = conn.query_row(
        "SELECT COUNT(*) FROM audit_logs",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let today_events: i64 = conn.query_row(
        "SELECT COUNT(*) FROM audit_logs WHERE date(created_at) = date('now','localtime')",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT action, COUNT(*) as cnt FROM audit_logs GROUP BY action ORDER BY cnt DESC LIMIT 10",
    ).map_err(|e| e.to_string())?;

    let events_by_type = stmt.query_map([], |row| {
        Ok(TypeCount {
            action: row.get(0)?,
            count: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;

    let types: Vec<TypeCount> = events_by_type.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    Ok(AuditSummary {
        total_events,
        today_events,
        events_by_type: types,
    })
}

/// P1-02 FIX: Se añade require_admin para proteger la exportación de datos sensibles.
#[tauri::command]
pub fn export_audit_logs_csv(
    state: State<AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<(String, String), String> {
    // Seguridad: solo administradores pueden exportar el registro completo de auditoría
    auth_guard::require_admin(&state)?;

    let logs = get_audit_logs(
        state,
        None,
        None,
        None,
        start_date.clone(),
        end_date.clone(),
        Some(10000),
    )?;

    let mut csv = String::from("Fecha,Usuario,Tabla,Registro,Acción,Valores Anteriores,Valores Nuevos,Máquina\n");
    for log in &logs {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            log.created_at,
            log.username.clone().unwrap_or_default(),
            log.table_name.clone().unwrap_or_default(),
            log.record_id.unwrap_or_default(),
            log.action,
            log.old_values.clone().unwrap_or_default().replace(',', ";"),
            log.new_values.clone().unwrap_or_default().replace(',', ";"),
            log.machine_name.clone().unwrap_or_default().replace(',', ";"),
        ));
    }

    let filename = format!("auditoria_{}.csv", chrono::Local::now().format("%Y%m%d_%H%M%S"));
    Ok((csv, filename))
}