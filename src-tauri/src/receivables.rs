use rusqlite::{Connection, Result};
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct Receivable {
    pub id: i64,
    pub customer_id: i64,
    pub customer_name: String,
    pub sale_id: i64,
    pub total: f64,
    pub paid: f64,
    pub status: String,
    pub created_at: String,
}

#[allow(dead_code)]
pub fn create_receivable(
    conn: &Connection,
    customer_id: i64,
    customer_name: &str,
    sale_id: i64,
    total: f64,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO receivables (customer_id, customer_name, sale_id, total) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![customer_id, customer_name, sale_id, total],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_receivables(conn: &Connection) -> Result<Vec<Receivable>> {
    let mut stmt = conn.prepare(
        "SELECT id, customer_id, customer_name, sale_id, total, paid, status, created_at FROM receivables ORDER BY id DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Receivable {
            id: row.get(0)?,
            customer_id: row.get(1)?,
            customer_name: row.get(2)?,
            sale_id: row.get(3)?,
            total: row.get(4)?,
            paid: row.get(5)?,
            status: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn register_payment(
    conn: &Connection,
    receivable_id: i64,
    amount: f64,
    payment_method: &str,
) -> Result<()> {
    conn.execute("BEGIN", [])?;

    // Insertar el pago
    conn.execute(
        "INSERT INTO receivable_payments (receivable_id, amount, payment_method) VALUES (?1, ?2, ?3)",
        rusqlite::params![receivable_id, amount, payment_method],
    )?;

    // Actualizar el monto pagado
    conn.execute(
        "UPDATE receivables SET paid = paid + ?1 WHERE id = ?2",
        rusqlite::params![amount, receivable_id],
    )?;

    // Marcar como pagada si ya no debe nada
    conn.execute(
        "UPDATE receivables SET status = 'paid' WHERE id = ?1 AND paid >= total",
        [receivable_id],
    )?;

    conn.execute("COMMIT", [])?;
    Ok(())
}
