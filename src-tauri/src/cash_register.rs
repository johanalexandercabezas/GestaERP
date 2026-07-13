use rusqlite::{Connection, Result};
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct CashRegister {
    pub id: i64,
    pub user_id: i64,
    pub open_date: String,
    pub close_date: Option<String>,
    pub initial_balance: f64,
    pub current_balance: f64,
    pub final_balance: Option<f64>,
    pub status: String,
}

pub fn open_register(conn: &Connection, user_id: i64, initial_balance: f64) -> Result<i64> {
    // Verificar que no haya otra caja abierta
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM cash_registers WHERE status = 'open'",
        [],
        |row| row.get(0),
    )?;
    if count > 0 {
        return Err(rusqlite::Error::InvalidParameterName(
            "Ya existe una caja abierta. Ciérrela antes de abrir una nueva.".to_string(),
        ));
    }

    conn.execute(
        "INSERT INTO cash_registers (user_id, initial_balance, current_balance) VALUES (?1, ?2, ?3)",
        rusqlite::params![user_id, initial_balance, initial_balance],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn close_register(conn: &Connection, register_id: i64, final_balance: f64) -> Result<()> {
    let affected = conn.execute(
        "UPDATE cash_registers SET final_balance = ?1, close_date = datetime('now','localtime'), status = 'closed' WHERE id = ?2 AND status = 'open'",
        rusqlite::params![final_balance, register_id],
    )?;
    if affected == 0 {
        return Err(rusqlite::Error::InvalidParameterName(
            "No se encontró una caja abierta con ese ID o ya fue cerrada.".to_string(),
        ));
    }
    Ok(())
}

pub fn get_open_register(conn: &Connection) -> Result<Option<CashRegister>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, open_date, close_date, initial_balance, current_balance, final_balance, status FROM cash_registers WHERE status = 'open' ORDER BY id DESC LIMIT 1",
    )?;
    let result = stmt.query_row([], |row| {
        Ok(CashRegister {
            id: row.get(0)?,
            user_id: row.get(1)?,
            open_date: row.get(2)?,
            close_date: row.get(3)?,
            initial_balance: row.get(4)?,
            current_balance: row.get(5)?,
            final_balance: row.get(6)?,
            status: row.get(7)?,
        })
    });
    match result {
        Ok(reg) => Ok(Some(reg)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn get_recent_registers(conn: &Connection, limit: i64) -> Result<Vec<CashRegister>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, open_date, close_date, initial_balance, current_balance, final_balance, status FROM cash_registers ORDER BY id DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |row| {
        Ok(CashRegister {
            id: row.get(0)?,
            user_id: row.get(1)?,
            open_date: row.get(2)?,
            close_date: row.get(3)?,
            initial_balance: row.get(4)?,
            current_balance: row.get(5)?,
            final_balance: row.get(6)?,
            status: row.get(7)?,
        })
    })?;
    rows.collect()
}

/// Incrementa el saldo actual de la caja abierta en una cantidad (por una venta o gasto).
#[allow(dead_code)]
pub fn increment_balance(conn: &Connection, amount: f64) -> Result<()> {
    let rows = conn.execute(
        "UPDATE cash_registers SET current_balance = current_balance + ?1 WHERE status = 'open'",
        rusqlite::params![amount],
    )?;
    if rows == 0 {
        return Err(rusqlite::Error::InvalidParameterName(
            "No hay caja abierta para actualizar el balance".to_string(),
        ));
    }
    Ok(())
}

/// Incrementa el balance de la caja abierta dentro de una transacción existente.
/// A diferencia de `increment_balance`, no inicia ni confirma transacción.
pub fn increment_balance_in_transaction(conn: &Connection, amount: f64) -> Result<()> {
    let rows = conn.execute(
        "UPDATE cash_registers SET current_balance = current_balance + ?1 WHERE status = 'open'",
        [amount],
    )?;
    if rows == 0 {
        return Err(rusqlite::Error::InvalidParameterName(
            "No hay caja abierta para actualizar el balance".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        // CORRECCIÓN: Añadir el DEFAULT a open_date tal cual está en la BD real
        conn.execute_batch("
            CREATE TABLE users (id INTEGER PRIMARY KEY); 
            INSERT INTO users (id) VALUES (1);
            CREATE TABLE cash_registers (
                id INTEGER PRIMARY KEY, 
                user_id INTEGER, 
                open_date TEXT NOT NULL DEFAULT (datetime('now','localtime')), 
                close_date TEXT, 
                initial_balance REAL, 
                current_balance REAL, 
                final_balance REAL, 
                status TEXT NOT NULL DEFAULT 'open'
            );
        ").unwrap();
        conn
    }

    #[test]
    fn test_open_and_increment_balance() {
        let conn = setup_db();
        
        let reg_id = open_register(&conn, 1, 100.0).unwrap();
        assert_eq!(reg_id, 1);

        let reg = get_open_register(&conn).unwrap().unwrap();
        assert_eq!(reg.current_balance, 100.0);

        increment_balance(&conn, 50.0).unwrap();
        
        let reg_updated = get_open_register(&conn).unwrap().unwrap();
        assert_eq!(reg_updated.current_balance, 150.0);
    }

    #[test]
    fn test_cannot_open_two_registers() {
        let conn = setup_db();
        open_register(&conn, 1, 100.0).unwrap();
        
        let result = open_register(&conn, 1, 200.0);
        assert!(result.is_err(), "No debería permitir abrir dos cajas simultáneamente");
    }
}