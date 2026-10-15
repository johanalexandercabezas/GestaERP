use chrono::{Local, NaiveDate, Utc};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingBasisInput {
    pub basis: String,
    pub basis_detail: String,
    pub purpose: String,
    pub effective_date: String,
    pub evidence_method: String,
    pub evidence_reference: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingBasisRecord {
    pub basis: String,
    pub basis_detail: String,
    pub purpose: String,
    pub effective_date: String,
    pub evidence_method: String,
    pub evidence_reference: String,
    pub recorded_at: String,
    pub recorded_by_name: String,
}

pub fn list_records(
    conn: &Connection,
    subject_type: &str,
    subject_id: i64,
) -> Result<Vec<ProcessingBasisRecord>, String> {
    if !matches!(subject_type, "customer" | "supplier" | "employee") || subject_id <= 0 {
        return Err("Titular no válido".to_string());
    }
    let mut statement = conn
        .prepare(
            "SELECT basis, basis_detail, purpose, effective_date, evidence_method,
                    evidence_reference, recorded_at, recorded_by_name
             FROM personal_data_processing_records
             WHERE subject_type = ?1 AND subject_id = ?2
             ORDER BY id DESC",
        )
        .map_err(|error| format!("No se pudo consultar la trazabilidad: {error}"))?;
    let records = statement
        .query_map(rusqlite::params![subject_type, subject_id], |row| {
            Ok(ProcessingBasisRecord {
                basis: row.get(0)?,
                basis_detail: row.get(1)?,
                purpose: row.get(2)?,
                effective_date: row.get(3)?,
                evidence_method: row.get(4)?,
                evidence_reference: row.get(5)?,
                recorded_at: row.get(6)?,
                recorded_by_name: row.get(7)?,
            })
        })
        .map_err(|error| format!("No se pudo consultar la trazabilidad: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No se pudo leer la trazabilidad: {error}"))?;
    Ok(records)
}

pub fn record_basis(
    conn: &Connection,
    subject_type: &str,
    subject_id: i64,
    input: &ProcessingBasisInput,
    user_id: i64,
    user_name: &str,
) -> Result<(), String> {
    let subject_table = match subject_type {
        "customer" => "customers",
        "supplier" => "suppliers",
        "employee" => "employees",
        _ => return Err("Tipo de titular no válido".to_string()),
    };
    let exists: bool = conn
        .query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM {subject_table} WHERE id = ?1)"),
            [subject_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("No se pudo verificar el titular: {error}"))?;
    if !exists {
        return Err("No existe el registro del titular para guardar su trazabilidad".to_string());
    }

    let basis = input.basis.trim();
    let basis_detail = input.basis_detail.trim();
    let purpose = input.purpose.trim();
    let effective_date = input.effective_date.trim();
    let evidence_method = input.evidence_method.trim();
    let evidence_reference = input.evidence_reference.trim();

    if purpose.is_empty() || purpose.chars().count() > 500 {
        return Err("Indica una finalidad de tratamiento (máximo 500 caracteres)".to_string());
    }
    if basis_detail.chars().count() > 500 {
        return Err("El detalle de la base no puede superar 500 caracteres".to_string());
    }
    if user_name.trim().is_empty() || user_name.chars().count() > 120 {
        return Err("No se pudo identificar al usuario que registra la constancia".to_string());
    }
    let date = NaiveDate::parse_from_str(effective_date, "%Y-%m-%d")
        .map_err(|_| "La fecha de la base de tratamiento no es válida".to_string())?;
    if date > Local::now().date_naive() {
        return Err("La fecha de la base de tratamiento no puede estar en el futuro".to_string());
    }
    if evidence_reference.chars().count() > 160 {
        return Err("La referencia de soporte no puede superar 160 caracteres".to_string());
    }

    match basis {
        "authorization" => {
            if !matches!(
                evidence_method,
                "signed_paper" | "digital_form" | "email" | "recorded_verbal" | "other"
            ) {
                return Err("Selecciona el medio en que se obtuvo la autorización".to_string());
            }
        }
        "legal_exception" => {
            if basis_detail.is_empty() || evidence_method != "legal_exception" {
                return Err("Describe la excepción o base legal aplicable y su soporte".to_string());
            }
        }
        "not_personal_data" => {
            if subject_type == "employee" {
                return Err(
                    "Los datos de empleados requieren una base de tratamiento identificada"
                        .to_string(),
                );
            }
            if basis_detail.is_empty() || evidence_method != "assessment" {
                return Err("Describe por qué el registro no contiene datos personales".to_string());
            }
        }
        _ => return Err("Selecciona una base de tratamiento válida".to_string()),
    }

    let latest: Option<(
        String,
        String,
        String,
        String,
        String,
        String,
        Option<i64>,
        String,
    )> = conn
        .query_row(
            "SELECT basis, basis_detail, purpose, effective_date, evidence_method,
                    evidence_reference, recorded_by_user_id, recorded_by_name
             FROM personal_data_processing_records
             WHERE subject_type = ?1 AND subject_id = ?2
             ORDER BY id DESC LIMIT 1",
            rusqlite::params![subject_type, subject_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                ))
            },
        )
        .optional()
        .map_err(|error| format!("No se pudo verificar la trazabilidad anterior: {error}"))?;
    if let Some((
        previous_basis,
        previous_detail,
        previous_purpose,
        previous_date,
        previous_method,
        previous_reference,
        previous_user_id,
        previous_user_name,
    )) = latest
    {
        if previous_basis == basis
            && previous_detail == basis_detail
            && previous_purpose == purpose
            && previous_date == effective_date
            && previous_method == evidence_method
            && previous_reference == evidence_reference
            && previous_user_id == Some(user_id)
            && previous_user_name == user_name.trim()
        {
            return Ok(());
        }
    }

    conn.execute(
        "INSERT INTO personal_data_processing_records
            (subject_type, subject_id, basis, basis_detail, purpose, effective_date,
             evidence_method, evidence_reference, recorded_at, recorded_by_user_id, recorded_by_name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            subject_type,
            subject_id,
            basis,
            basis_detail,
            purpose,
            effective_date,
            evidence_method,
            evidence_reference,
            Utc::now().to_rfc3339(),
            user_id,
            user_name.trim(),
        ],
    )
    .map_err(|error| format!("No se pudo guardar la trazabilidad de datos: {error}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE customers (id INTEGER PRIMARY KEY);
             CREATE TABLE suppliers (id INTEGER PRIMARY KEY);
             CREATE TABLE employees (id INTEGER PRIMARY KEY);
             CREATE TABLE personal_data_processing_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_type TEXT NOT NULL,
                subject_id INTEGER NOT NULL,
                basis TEXT NOT NULL,
                basis_detail TEXT NOT NULL,
                purpose TEXT NOT NULL,
                effective_date TEXT NOT NULL,
                evidence_method TEXT NOT NULL,
                evidence_reference TEXT NOT NULL,
                recorded_at TEXT NOT NULL,
                recorded_by_user_id INTEGER NOT NULL,
                recorded_by_name TEXT NOT NULL
             );
             INSERT INTO customers (id) VALUES (1);
             INSERT INTO employees (id) VALUES (2);",
        )
        .unwrap();
        conn
    }

    fn valid_input() -> ProcessingBasisInput {
        ProcessingBasisInput {
            basis: "authorization".to_string(),
            basis_detail: String::new(),
            purpose: "Gestionar la relación comercial".to_string(),
            effective_date: Local::now().date_naive().to_string(),
            evidence_method: "signed_paper".to_string(),
            evidence_reference: "Archivo físico 2026-01".to_string(),
        }
    }

    #[test]
    fn records_authorization_for_existing_subject() {
        let conn = setup();
        let input = valid_input();
        record_basis(&conn, "customer", 1, &input, 7, "Admin").unwrap();
        record_basis(&conn, "customer", 1, &input, 7, "Admin").unwrap();

        let history = list_records(&conn, "customer", 1).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].basis, "authorization");
        assert_eq!(history[0].recorded_by_name, "Admin");

        let mut changed = input;
        changed.purpose = "Facturación electrónica".to_string();
        record_basis(&conn, "customer", 1, &changed, 7, "Admin").unwrap();
        assert_eq!(list_records(&conn, "customer", 1).unwrap().len(), 2);
    }

    #[test]
    fn rejects_future_dates_and_missing_legal_basis_detail() {
        let conn = setup();
        let mut input = valid_input();
        input.effective_date = "2999-01-01".to_string();
        assert!(record_basis(&conn, "customer", 1, &input, 7, "Admin").is_err());

        let mut input = valid_input();
        input.basis = "legal_exception".to_string();
        input.evidence_method = "legal_exception".to_string();
        assert!(record_basis(&conn, "customer", 1, &input, 7, "Admin").is_err());
    }

    #[test]
    fn employees_cannot_be_marked_as_non_personal_data() {
        let conn = setup();
        let mut input = valid_input();
        input.basis = "not_personal_data".to_string();
        input.basis_detail = "Entidad jurídica".to_string();
        input.evidence_method = "assessment".to_string();
        assert!(record_basis(&conn, "employee", 2, &input, 7, "Admin").is_err());
    }
}
