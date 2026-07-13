use tauri::State;
use crate::AppState;
use crate::auth_guard;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountingClosureRow {
    pub id: i64,
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub closure_date: String,
    pub cash_sales: f64,
    pub card_sales: f64,
    pub transfer_sales: f64,
    pub total_income: f64,
    pub expenses: f64,
    pub net_result: f64,
    pub observations: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn create_accounting_closure(
    state: State<AppState>,
    cash_sales: f64,
    card_sales: f64,
    transfer_sales: f64,
    expenses: f64,
    observations: Option<String>,
    user_id: i64,
) -> Result<i64, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let total_income = cash_sales + card_sales + transfer_sales;
    let net_result = total_income - expenses;

    conn.execute(
        "INSERT INTO accounting_closures (user_id, closure_date, cash_sales, card_sales, transfer_sales, total_income, expenses, net_result, observations)
         VALUES (?1, date('now','localtime'), ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![user_id, cash_sales, card_sales, transfer_sales, total_income, expenses, net_result, observations],
    ).map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn list_accounting_closures(
    state: State<AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<AccountingClosureRow>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let sd_clone = start_date.clone();
    let ed_clone = end_date.clone();
    let (where_clause, params): (String, Vec<String>) = if let (Some(ref sd), Some(ref ed)) = (&start_date, &end_date) {
        (
            "WHERE closure_date >= ?1 AND closure_date <= ?2".to_string(),
            vec![sd.clone(), ed.clone()],
        )
    } else if let Some(sd) = sd_clone {
        (
            "WHERE closure_date >= ?1".to_string(),
            vec![sd],
        )
    } else if let Some(ed) = ed_clone {
        (
            "WHERE closure_date <= ?1".to_string(),
            vec![ed],
        )
    } else {
        (String::new(), Vec::new())
    };

    let query = format!(
        "SELECT c.id, c.user_id, COALESCE(u.username, 'Desconocido') as username, c.closure_date, c.cash_sales, c.card_sales, c.transfer_sales, c.total_income, c.expenses, c.net_result, c.observations, c.created_at
         FROM accounting_closures c
         LEFT JOIN users u ON u.id = c.user_id
         {} ORDER BY c.closure_date DESC",
        where_clause
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params), |row| {
        Ok(AccountingClosureRow {
            id: row.get(0)?,
            user_id: row.get(1)?,
            username: row.get(2)?,
            closure_date: row.get(3)?,
            cash_sales: row.get(4)?,
            card_sales: row.get(5)?,
            transfer_sales: row.get(6)?,
            total_income: row.get(7)?,
            expenses: row.get(8)?,
            net_result: row.get(9)?,
            observations: row.get(10)?,
            created_at: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_accounting_summary(
    state: State<AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<AccountingClosureRow, String> {
    let closures = list_accounting_closures(state, start_date, end_date)?;

    let total_cash: f64 = closures.iter().map(|c| c.cash_sales).sum();
    let total_card: f64 = closures.iter().map(|c| c.card_sales).sum();
    let total_transfer: f64 = closures.iter().map(|c| c.transfer_sales).sum();
    let total_income: f64 = closures.iter().map(|c| c.total_income).sum();
    let total_expenses: f64 = closures.iter().map(|c| c.expenses).sum();
    let net_result: f64 = closures.iter().map(|c| c.net_result).sum();

    Ok(AccountingClosureRow {
        id: 0,
        user_id: None,
        username: Some("Resumen".to_string()),
        closure_date: "Periodo".to_string(),
        cash_sales: total_cash,
        card_sales: total_card,
        transfer_sales: total_transfer,
        total_income,
        expenses: total_expenses,
        net_result,
        observations: None,
        created_at: String::new(),
    })
}