//! Transaction Guard — Auto-rollback on early return (panic-safe).
//!
//! Reemplaza las definiciones duplicadas de TransactionGuard en
//! `sales.rs` y `commands/expenses.rs` con una implementación única.
//!
//! Uso:
//! ```ignore
//! let tx = TransactionGuard::begin(&conn)?;
//! // ... operaciones ...
//! tx.commit()?;  // Si no se llama, el Drop hace ROLLBACK automático
//! ```

use rusqlite::Connection;

/// Guardián de transacción con ROLLBACK automático al salir del scope.
/// Si `commit()` no es llamado explícitamente, el `Drop` ejecuta ROLLBACK.
pub struct TransactionGuard<'a> {
    conn: &'a Connection,
    active: bool,
}

impl<'a> TransactionGuard<'a> {
    /// Inicia una transacción con BEGIN.
    pub fn begin(conn: &'a Connection) -> Result<Self, String> {
        conn.execute("BEGIN", [])
            .map_err(|e| format!("Error al iniciar transacción: {}", e))?;
        Ok(Self { conn, active: true })
    }

    /// Confirma la transacción con COMMIT.
    /// Después de llamar a commit, el Drop NO hará ROLLBACK.
    pub fn commit(mut self) -> Result<(), String> {
        self.conn
            .execute("COMMIT", [])
            .map_err(|e| format!("Error al confirmar transacción: {}", e))?;
        self.active = false;
        Ok(())
    }
}

impl<'a> Drop for TransactionGuard<'a> {
    fn drop(&mut self) {
        if self.active {
            let _ = self.conn.execute("ROLLBACK", []);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_commit_works() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE test (id INTEGER)", []).unwrap();

        let tx = TransactionGuard::begin(&conn).unwrap();
        conn.execute("INSERT INTO test VALUES (1)", []).unwrap();
        tx.commit().unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM test", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_rollback_on_drop() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE test (id INTEGER)", []).unwrap();

        {
            let _tx = TransactionGuard::begin(&conn).unwrap();
            conn.execute("INSERT INTO test VALUES (1)", []).unwrap();
            // tx se dropea aquí sin commit → ROLLBACK
        }

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM test", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}