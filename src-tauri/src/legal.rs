use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

pub const TERMS_VERSION: &str = "terms-2026-10-v1";
pub const PRIVACY_NOTICE_VERSION: &str = "privacy-2026-10-v1";

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct LegalAcceptanceStatus {
    pub terms_version: String,
    pub privacy_notice_version: String,
    pub terms_accepted: bool,
    pub privacy_notice_acknowledged: bool,
    pub terms_accepted_at: Option<String>,
    pub privacy_notice_acknowledged_at: Option<String>,
}

pub fn acceptance_status(conn: &Connection) -> Result<LegalAcceptanceStatus, String> {
    let terms_accepted_at = document_acceptance_date(conn, "terms", TERMS_VERSION)?;
    let privacy_notice_acknowledged_at =
        document_acceptance_date(conn, "privacy_notice", PRIVACY_NOTICE_VERSION)?;
    Ok(LegalAcceptanceStatus {
        terms_version: TERMS_VERSION.to_string(),
        privacy_notice_version: PRIVACY_NOTICE_VERSION.to_string(),
        terms_accepted: terms_accepted_at.is_some(),
        privacy_notice_acknowledged: privacy_notice_acknowledged_at.is_some(),
        terms_accepted_at,
        privacy_notice_acknowledged_at,
    })
}

fn document_acceptance_date(
    conn: &Connection,
    document_type: &str,
    document_version: &str,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT accepted_at FROM legal_acceptances
         WHERE document_type = ?1 AND document_version = ?2
         ORDER BY id DESC
         LIMIT 1",
        params![document_type, document_version],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|error| format!("No se pudo consultar la aceptación de documentos: {error}"))
}

pub fn require_current_acceptance(conn: &Connection) -> Result<(), String> {
    let status = acceptance_status(conn)?;
    if !status.terms_accepted || !status.privacy_notice_acknowledged {
        return Err(
            "Antes de continuar, debes leer y aceptar los términos y reconocer el aviso de privacidad vigente."
                .to_string(),
        );
    }
    Ok(())
}

pub fn accept_current_documents(
    conn: &Connection,
    terms_accepted: bool,
    privacy_notice_acknowledged: bool,
    app_version: &str,
) -> Result<LegalAcceptanceStatus, String> {
    if !terms_accepted || !privacy_notice_acknowledged {
        return Err("Debes aceptar los términos y reconocer el aviso de privacidad.".to_string());
    }
    let transaction = conn
        .unchecked_transaction()
        .map_err(|error| format!("No se pudo iniciar el registro de aceptación: {error}"))?;
    let accepted_at = Utc::now().to_rfc3339();

    for (document_type, document_version) in [
        ("terms", TERMS_VERSION),
        ("privacy_notice", PRIVACY_NOTICE_VERSION),
    ] {
        let already_accepted: bool = transaction
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM legal_acceptances
                    WHERE document_type = ?1 AND document_version = ?2
                 )",
                params![document_type, document_version],
                |row| row.get(0),
            )
            .map_err(|error| {
                format!("No se pudo verificar la aceptación de documentos: {error}")
            })?;
        if !already_accepted {
            transaction
                .execute(
                    "INSERT INTO legal_acceptances
                        (document_type, document_version, accepted_at, app_version, acceptance_method)
                     VALUES (?1, ?2, ?3, ?4, 'desktop_checkbox')",
                    params![document_type, document_version, accepted_at, app_version],
                )
                .map_err(|error| {
                    format!("No se pudo guardar la aceptación de documentos: {error}")
                })?;
        }
    }

    transaction
        .commit()
        .map_err(|error| format!("No se pudo confirmar la aceptación: {error}"))?;
    acceptance_status(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE legal_acceptances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_type TEXT NOT NULL,
                document_version TEXT NOT NULL,
                accepted_at TEXT NOT NULL,
                app_version TEXT NOT NULL,
                acceptance_method TEXT NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn current_documents_are_required_before_activation() {
        let conn = connection();
        assert!(require_current_acceptance(&conn).is_err());

        accept_current_documents(&conn, true, true, "test").unwrap();
        assert!(require_current_acceptance(&conn).is_ok());
    }

    #[test]
    fn acceptance_is_versioned_and_idempotent() {
        let conn = connection();
        accept_current_documents(&conn, true, true, "test").unwrap();
        accept_current_documents(&conn, true, true, "test").unwrap();

        let receipt_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM legal_acceptances", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(receipt_count, 2);
        let status = acceptance_status(&conn).unwrap();
        assert_eq!(status.terms_version, TERMS_VERSION);
        assert_eq!(status.privacy_notice_version, PRIVACY_NOTICE_VERSION);
        assert!(status.terms_accepted);
        assert!(status.privacy_notice_acknowledged);
        assert!(status.terms_accepted_at.is_some());
        assert!(status.privacy_notice_acknowledged_at.is_some());
    }

    #[test]
    fn a_new_document_version_requires_new_acceptance() {
        let conn = connection();
        conn.execute(
            "INSERT INTO legal_acceptances
                (document_type, document_version, accepted_at, app_version, acceptance_method)
             VALUES ('terms', 'old-version', '2026-01-01T00:00:00Z', '1.0.0', 'desktop_checkbox')",
            [],
        )
        .unwrap();
        assert!(!acceptance_status(&conn).unwrap().terms_accepted);
    }

    #[test]
    fn acceptance_rejects_missing_checkbox_confirmation() {
        let conn = connection();
        assert!(accept_current_documents(&conn, true, false, "test").is_err());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM legal_acceptances", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }
}
