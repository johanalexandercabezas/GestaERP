use rusqlite::{Connection, Result};
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct Supplier {
    pub id: i64,
    pub name: String,
    pub nit: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub doc_type: Option<String>,
    pub city: Option<String>,
    pub address: Option<String>,
    pub payment_method: Option<String>,
    pub bank_name: Option<String>,
    pub bank_account: Option<String>,
    pub iva_responsible: bool,
    pub offers_credit: bool,
    pub credit_days: i64,
    pub credit_limit: f64,
}

pub fn create_supplier(
    conn: &Connection,
    name: &str,
    nit: Option<&str>,
    phone: Option<&str>,
    email: Option<&str>,
    doc_type: Option<&str>,
    city: Option<&str>,
    address: Option<&str>,
    payment_method: Option<&str>,
    bank_name: Option<&str>,
    bank_account: Option<&str>,
    iva_responsible: bool,
    offers_credit: bool,
    credit_days: i64,
    credit_limit: f64,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO suppliers (name, nit, phone, email, doc_type, city, address, payment_method, bank_name, bank_account, iva_responsible, offers_credit, credit_days, credit_limit)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            name, nit, phone, email, doc_type, city, address,
            payment_method, bank_name, bank_account,
            iva_responsible as i64, offers_credit as i64,
            credit_days, credit_limit,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_suppliers(conn: &Connection) -> Result<Vec<Supplier>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, nit, phone, email, doc_type, city, address, payment_method, bank_name, bank_account, iva_responsible, offers_credit, credit_days, credit_limit FROM suppliers ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Supplier {
            id: row.get(0)?,
            name: row.get(1)?,
            nit: row.get(2)?,
            phone: row.get(3)?,
            email: row.get(4)?,
            doc_type: row.get(5)?,
            city: row.get(6)?,
            address: row.get(7)?,
            payment_method: row.get(8)?,
            bank_name: row.get(9)?,
            bank_account: row.get(10)?,
            iva_responsible: row.get::<_, i64>(11)? != 0,
            offers_credit: row.get::<_, i64>(12)? != 0,
            credit_days: row.get(13)?,
            credit_limit: row.get(14)?,
        })
    })?;
    rows.collect()
}

pub fn update_supplier(conn: &Connection, s: &Supplier) -> Result<()> {
    conn.execute(
        "UPDATE suppliers SET name=?1, nit=?2, phone=?3, email=?4, doc_type=?5, city=?6, address=?7, payment_method=?8, bank_name=?9, bank_account=?10, iva_responsible=?11, offers_credit=?12, credit_days=?13, credit_limit=?14 WHERE id=?15",
        rusqlite::params![
            s.name, s.nit, s.phone, s.email, s.doc_type, s.city, s.address,
            s.payment_method, s.bank_name, s.bank_account,
            s.iva_responsible as i64, s.offers_credit as i64,
            s.credit_days, s.credit_limit, s.id,
        ],
    )?;
    Ok(())
}

pub fn delete_supplier(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM suppliers WHERE id=?1", [id])?;
    Ok(())
}