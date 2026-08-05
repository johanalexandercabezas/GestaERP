use rusqlite::{Connection, Result};
use serde::Serialize;
use rand::Rng;
use chrono::Utc;

/// Estructura para el estado de implementación
#[derive(Serialize, Debug, Clone)]
pub struct ImplementationStatus {
    pub is_paid: bool,
    pub code: String,
    pub generated_at: String,
    pub validated_at: Option<String>,
}

/// Crea la tabla `implementation_codes` en producción (P0-04 FIX).
/// Se llama desde `db::init_db()` junto con otras tablas auxiliares.
pub fn create_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS implementation_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            generated_at TEXT NOT NULL,
            validated_at TEXT,
            active INTEGER NOT NULL DEFAULT 1
        );",
    )?;
    Ok(())
}

/// Genera un código único de aceptación de implementación (6 caracteres alfanuméricos)
fn generate_code() -> String {
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    let mut rng = rand::thread_rng();
    (0..6).map(|_| chars[rng.gen_range(0..chars.len())]).collect()
}

/// Verifica si ya existe un código de implementación para esta instalación
pub fn get_implementation_status(conn: &Connection) -> ImplementationStatus {
    let row = conn.query_row(
        "SELECT code, generated_at, validated_at FROM implementation_codes WHERE active = 1 ORDER BY id DESC LIMIT 1",
        [],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        },
    );

    match row {
        Ok((code, generated_at, validated_at)) => ImplementationStatus {
            is_paid: validated_at.is_some(),
            code,
            generated_at,
            validated_at,
        },
        Err(_) => ImplementationStatus {
            is_paid: false,
            code: String::new(),
            generated_at: String::new(),
            validated_at: None,
        },
    }
}

/// Genera un nuevo código de aceptación de implementación
/// Solo se puede generar uno si no hay uno activo ya validado
pub fn generate_implementation_code(conn: &Connection) -> Result<ImplementationStatus, String> {
    let current = get_implementation_status(conn);

    // Si ya hay un código validado (pagado), no permitir generar otro
    if current.is_paid {
        return Err("La implementación ya ha sido pagada y validada.".into());
    }

    // Si hay un código activo sin validar, devolver ese mismo
    if !current.code.is_empty() {
        return Ok(current);
    }

    let code = generate_code();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO implementation_codes (code, generated_at, active) VALUES (?1, ?2, 1)",
        rusqlite::params![code, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(ImplementationStatus {
        is_paid: false,
        code,
        generated_at: now,
        validated_at: None,
    })
}

/// Valida un código de aceptación de implementación
/// Retorna Ok si el código es válido, Err si no
pub fn validate_implementation_code(
    conn: &Connection,
    input_code: &str,
) -> Result<ImplementationStatus, String> {
    let normalized = input_code.trim().to_uppercase();

    let row = conn.query_row(
        "SELECT id, code, generated_at, validated_at FROM implementation_codes WHERE code = ?1 AND active = 1",
        [&normalized],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        },
    );

    match row {
        Ok((_id, code, generated_at, Some(validated_at))) => {
            // Ya fue validado antes
            Ok(ImplementationStatus {
                is_paid: true,
                code,
                generated_at,
                validated_at: Some(validated_at),
            })
        }
        Ok((id, code, generated_at, None)) => {
            // Primera validación: marcar como validado
            let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
            conn.execute(
                "UPDATE implementation_codes SET validated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, id],
            )
            .map_err(|e| e.to_string())?;

            Ok(ImplementationStatus {
                is_paid: true,
                code,
                generated_at,
                validated_at: Some(now),
            })
        }
        Err(_) => Err("Código de aceptación inválido. Verifica e intenta de nuevo.".into()),
    }
}

/// Verifica si la implementación está pagada (para el guard del frontend)
pub fn is_implementation_paid(conn: &Connection) -> bool {
    get_implementation_status(conn).is_paid
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE implementation_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                generated_at TEXT NOT NULL,
                validated_at TEXT,
                active INTEGER NOT NULL DEFAULT 1
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_generate_code_length() {
        let code = generate_code();
        assert_eq!(code.len(), 6);
        assert!(code.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn test_full_implementation_flow() {
        let conn = setup_test_db();

        // Estado inicial: no pagado
        let status = get_implementation_status(&conn);
        assert!(!status.is_paid);
        assert!(status.code.is_empty());

        // Generar código
        let gen = generate_implementation_code(&conn).unwrap();
        assert!(!gen.is_paid);
        assert_eq!(gen.code.len(), 6);

        // Validar con código incorrecto
        let bad = validate_implementation_code(&conn, "WRONG!");
        assert!(bad.is_err());

        // Validar con código correcto
        let good = validate_implementation_code(&conn, &gen.code).unwrap();
        assert!(good.is_paid);
        assert!(good.validated_at.is_some());

        // Verificar estado final
        let final_status = get_implementation_status(&conn);
        assert!(final_status.is_paid);

        // No se puede generar otro código
        let second = generate_implementation_code(&conn);
        assert!(second.is_err());
    }

    #[test]
    fn test_implementation_code_case_insensitive() {
        let conn = setup_test_db();
        let gen = generate_implementation_code(&conn).unwrap();
        let lower = gen.code.to_lowercase();
        let result = validate_implementation_code(&conn, &lower).unwrap();
        assert!(result.is_paid);
    }
}