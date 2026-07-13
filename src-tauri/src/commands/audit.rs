use tauri::State;
use crate::AppState;
use crate::auth_guard;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditLogRow {
    pub id: i64,
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub action_type: String,
    pub entity_type: String,
    pub entity_id: Option<i64>,
    pub details: Option<String>,
    pub ip_address: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditSummary {
    pub total_events: i64,
    pub today_events: i64,
    pub events_by_type: Vec<TypeCount>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TypeCount {
    pub action_type: String,
    pub count: i64,
}

#[tauri::command]
pub fn get_audit_logs(
    state: State<AppState>,
    user_id: Option<i64>,
    action_type: Option<String>,
    entity_type: Option<String>,
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
    if let Some(ref at) = action_type {
        conditions.push("l.action_type = ?".to_string());
        params.push(Box::new(at.clone()));
    }
    if let Some(ref et) = entity_type {
        conditions.push("l.entity_type = ?".to_string());
        params.push(Box::new(et.clone()));
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
        "SELECT l.id, l.user_id, COALESCE(u.username, 'Desconocido') as username, l.action_type, l.entity_type, l.entity_id, l.details, l.ip_address, l.created_at
         FROM audit_logs l
         LEFT JOIN users u ON u.id = l.user_id
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
            action_type: row.get(3)?,
            entity_type: row.get(4)?,
            entity_id: row.get(5)?,
            details: row.get(6)?,
            ip_address: row.get(7)?,
            created_at: row.get(8)?,
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
        "SELECT action_type, COUNT(*) as cnt FROM audit_logs GROUP BY action_type ORDER BY cnt DESC LIMIT 10"
    ).map_err(|e| e.to_string())?;

    let events_by_type = stmt.query_map([], |row| {
        Ok(TypeCount {
            action_type: row.get(0)?,
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

#[tauri::command]
pub fn export_audit_logs_csv(
    state: State<AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<(String, String), String> {
    let logs = get_audit_logs(
        state,
        None, None, None,
        start_date.clone(),
        end_date.clone(),
        Some(10000),
    )?;

    let mut csv = String::from("Fecha,Usuario,Tipo Acción,Tipo Entidad,Entidad ID,Detalles,IP\n");
    for log in &logs {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            log.created_at,
            log.username.clone().unwrap_or_default(),
            log.action_type,
            log.entity_type,
            log.entity_id.unwrap_or_default(),
            log.details.clone().unwrap_or_default().replace(',', ";"),
            log.ip_address.clone().unwrap_or_default()
        ));
    }

    let filename = format!("auditoria_{}.csv", chrono::Local::now().format("%Y%m%d_%H%M%S"));
    Ok((csv, filename))
}