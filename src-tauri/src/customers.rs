use rusqlite::{Connection, Result};
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct Customer {
    pub id: i64,
    pub name: String,
    pub doc_type: Option<String>,
    pub doc_number: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
}

pub fn create_customer(
    conn: &Connection,
    name: &str,
    doc_type: Option<&str>,
    doc_number: Option<&str>,
    phone: Option<&str>,
    email: Option<&str>,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO customers (name, doc_type, doc_number, phone, email) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![name, doc_type, doc_number, phone, email],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_customers(conn: &Connection) -> Result<Vec<Customer>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, doc_type, doc_number, phone, email FROM customers ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Customer {
            id: row.get(0)?,
            name: row.get(1)?,
            doc_type: row.get(2)?,
            doc_number: row.get(3)?,
            phone: row.get(4)?,
            email: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn update_customer(conn: &Connection, c: &Customer) -> Result<()> {
    conn.execute(
        "UPDATE customers SET name=?1, doc_type=?2, doc_number=?3, phone=?4, email=?5 WHERE id=?6",
        rusqlite::params![c.name, c.doc_type, c.doc_number, c.phone, c.email, c.id],
    )?;
    Ok(())
}

pub fn delete_customer(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM customers WHERE id=?1", [id])?;
    Ok(())
}