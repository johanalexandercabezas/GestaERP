use rusqlite::{Connection, Result};
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct Expense {
    pub id: i64,
    pub user_id: i64,
    pub description: String,
    pub amount: f64,
    pub category: String,
    pub payment_method: String,
    pub supplier_id: Option<i64>,
    pub supplier_name: Option<String>,
    pub created_at: String,
}

pub fn create_expense(
    conn: &Connection,
    user_id: i64,
    description: &str,
    amount: f64,
    category: &str,
    payment_method: &str,
    supplier_id: Option<i64>,
    supplier_name: Option<&str>,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO expenses (user_id, description, amount, category, payment_method, supplier_id, supplier_name) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![user_id, description, amount, category, payment_method, supplier_id, supplier_name],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_expenses(
    conn: &Connection,
    limit: i64,
    supplier_id: Option<i64>,
) -> Result<Vec<Expense>> {
    let query = "SELECT id, user_id, description, amount, category, payment_method, supplier_id, supplier_name, created_at FROM expenses WHERE (?1 IS NULL OR supplier_id = ?1) ORDER BY id DESC LIMIT ?2";
    let mut stmt = conn.prepare(query)?;
    let rows = stmt.query_map(rusqlite::params![supplier_id, limit], |row| {
        Ok(Expense {
            id: row.get(0)?,
            user_id: row.get(1)?,
            description: row.get(2)?,
            amount: row.get(3)?,
            category: row.get(4)?,
            payment_method: row.get(5)?,
            supplier_id: row.get(6)?,
            supplier_name: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    rows.collect()
}
