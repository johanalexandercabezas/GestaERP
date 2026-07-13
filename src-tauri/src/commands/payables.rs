use tauri::State;
use crate::AppState;
use crate::auth_guard;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PayableRow {
    pub id: i64,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub invoice_number: String,
    pub invoice_date: String,
    pub due_date: String,
    pub total_amount: f64,
    pub paid_amount: f64,
    pub balance: f64,
    pub status: String,
    pub observations: Option<String>,
    pub created_by: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PayablePaymentRow {
    pub id: i64,
    pub payable_id: i64,
    pub payment_date: String,
    pub amount: f64,
    pub payment_method: String,
    pub reference: Option<String>,
    pub observations: Option<String>,
    pub created_by: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PayablesSummary {
    pub total_pending: f64,
    pub total_partial: f64,
    pub total_paid: f64,
    pub total_overdue: f64,
}

#[tauri::command]
pub fn create_payable(
    state: State<AppState>,
    supplier_id: i64,
    supplier_name: String,
    invoice_number: String,
    invoice_date: String,
    due_date: String,
    total_amount: f64,
    observations: Option<String>,
    created_by: i64,
) -> Result<i64, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO payables (supplier_id, supplier_name, invoice_number, invoice_date, due_date, total_amount, paid_amount, balance, status, observations, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?6, 'Pendiente', ?7, ?8)",
        rusqlite::params![
            supplier_id, supplier_name, invoice_number, invoice_date, due_date,
            total_amount, observations, created_by
        ],
    ).map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn list_payables(
    state: State<AppState>,
    status_filter: Option<String>,
    supplier_id: Option<i64>,
) -> Result<Vec<PayableRow>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut conditions = Vec::new();
    let mut params = Vec::new();

    if let Some(ref status) = status_filter {
        conditions.push("status = ?".to_string());
        params.push(status.clone());
    }
    if let Some(sid) = supplier_id {
        conditions.push("supplier_id = ?".to_string());
        params.push(sid.to_string());
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let query = format!(
        "SELECT id, supplier_id, supplier_name, invoice_number, invoice_date, due_date, total_amount, paid_amount, balance, status, observations, created_by, created_at, updated_at
         FROM payables {} ORDER BY invoice_date DESC",
        where_clause
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params), |row| {
        Ok(PayableRow {
            id: row.get(0)?,
            supplier_id: row.get(1)?,
            supplier_name: row.get(2)?,
            invoice_number: row.get(3)?,
            invoice_date: row.get(4)?,
            due_date: row.get(5)?,
            total_amount: row.get(6)?,
            paid_amount: row.get(7)?,
            balance: row.get(8)?,
            status: row.get(9)?,
            observations: row.get(10)?,
            created_by: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_payable(state: State<AppState>, id: i64) -> Result<PayableRow, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, supplier_id, supplier_name, invoice_number, invoice_date, due_date, total_amount, paid_amount, balance, status, observations, created_by, created_at, updated_at
         FROM payables WHERE id = ?1",
        [id],
        |row| {
            Ok(PayableRow {
                id: row.get(0)?,
                supplier_id: row.get(1)?,
                supplier_name: row.get(2)?,
                invoice_number: row.get(3)?,
                invoice_date: row.get(4)?,
                due_date: row.get(5)?,
                total_amount: row.get(6)?,
                paid_amount: row.get(7)?,
                balance: row.get(8)?,
                status: row.get(9)?,
                observations: row.get(10)?,
                created_by: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        },
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn register_payable_payment(
    state: State<AppState>,
    payable_id: i64,
    amount: f64,
    payment_method: String,
    reference: Option<String>,
    observations: Option<String>,
    created_by: i64,
) -> Result<i64, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Insertar pago
    conn.execute(
        "INSERT INTO payable_payments (payable_id, amount, payment_method, reference, observations, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![payable_id, amount, payment_method, reference, observations, created_by],
    ).map_err(|e| e.to_string())?;

    // Actualizar saldo
    let current_paid: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM payable_payments WHERE payable_id = ?1",
        [payable_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total: f64 = conn.query_row(
        "SELECT total_amount FROM payables WHERE id = ?1",
        [payable_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let new_status = if current_paid >= total {
        "Pagada"
    } else if current_paid > 0.0 {
        "Parcial"
    } else {
        "Pendiente"
    };

    conn.execute(
        "UPDATE payables SET paid_amount = ?1, balance = ?2 - ?1, status = ?3, updated_at = datetime('now','localtime') WHERE id = ?4",
        rusqlite::params![current_paid, total, new_status, payable_id],
    ).map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn list_payable_payments(state: State<AppState>, payable_id: i64) -> Result<Vec<PayablePaymentRow>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, payable_id, payment_date, amount, payment_method, reference, observations, created_by
         FROM payable_payments WHERE payable_id = ?1 ORDER BY payment_date DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([payable_id], |row| {
        Ok(PayablePaymentRow {
            id: row.get(0)?,
            payable_id: row.get(1)?,
            payment_date: row.get(2)?,
            amount: row.get(3)?,
            payment_method: row.get(4)?,
            reference: row.get(5)?,
            observations: row.get(6)?,
            created_by: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_payables_summary(state: State<AppState>) -> Result<PayablesSummary, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let total_pending: f64 = conn.query_row(
        "SELECT COALESCE(SUM(balance), 0) FROM payables WHERE status = 'Pendiente'",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_partial: f64 = conn.query_row(
        "SELECT COALESCE(SUM(balance), 0) FROM payables WHERE status = 'Parcial'",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_paid: f64 = conn.query_row(
        "SELECT COALESCE(SUM(paid_amount), 0) FROM payables WHERE status = 'Pagada'",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_overdue: f64 = conn.query_row(
        "SELECT COALESCE(SUM(balance), 0) FROM payables WHERE status != 'Pagada' AND due_date < date('now','localtime')",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    Ok(PayablesSummary {
        total_pending,
        total_partial,
        total_paid,
        total_overdue,
    })
}