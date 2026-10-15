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
    pub processing_basis: Option<crate::personal_data::ProcessingBasisRecord>,
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
        "SELECT c.id, c.name, c.doc_type, c.doc_number, c.phone, c.email,
                r.basis, r.basis_detail, r.purpose, r.effective_date,
                r.evidence_method, r.evidence_reference, r.recorded_at, r.recorded_by_name
         FROM customers c
         LEFT JOIN personal_data_processing_records r ON r.id = (
             SELECT id FROM personal_data_processing_records
             WHERE subject_type = 'customer' AND subject_id = c.id
             ORDER BY id DESC LIMIT 1
         )
         ORDER BY c.name",
    )?;
    let rows = stmt.query_map([], |row| {
        let basis: Option<String> = row.get(6)?;
        let processing_basis = basis
            .map(|basis| {
                Ok::<_, rusqlite::Error>(crate::personal_data::ProcessingBasisRecord {
                    basis,
                    basis_detail: row.get(7)?,
                    purpose: row.get(8)?,
                    effective_date: row.get(9)?,
                    evidence_method: row.get(10)?,
                    evidence_reference: row.get(11)?,
                    recorded_at: row.get(12)?,
                    recorded_by_name: row.get(13)?,
                })
            })
            .transpose()?;
        Ok(Customer {
            id: row.get(0)?,
            name: row.get(1)?,
            doc_type: row.get(2)?,
            doc_number: row.get(3)?,
            phone: row.get(4)?,
            email: row.get(5)?,
            processing_basis,
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
