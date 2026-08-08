use chrono::{Duration, NaiveDate, Utc};
use hmac::{Hmac, Mac};
use rusqlite::{Connection, Result};
use serde::Serialize;
use sha2::Sha256;

const LICENSE_DAYS: i64 = 30;
const TRIAL_DAYS: i64 = 15;

#[derive(Serialize, Debug, Clone)]
pub struct LicenseInfo {
    pub plan: String,
    pub activated: bool,
    pub expires_at: String,
    pub max_users: i64,
    pub days_left: i64,
    pub modules: Vec<String>,
}

fn plan_to_prefix(plan: &str) -> &str {
    match plan {
        "basico" => "BAS",
        "intermedio" => "INT",
        "avanzado" => "AVZ",
        "ong" => "ONG",
        _ => "TST",
    }
}

fn validate_key(key: &str, expected_plan: &str) -> bool {
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() != 3 {
        return false;
    }
    if parts[1] != plan_to_prefix(expected_plan) {
        return false;
    }

    // Ventana de 5 días para generar la clave
    let secret = crate::config::get_secret_key();
    for offset in 0..5 {
        let date = Utc::now().date_naive() - Duration::days(offset);
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        let payload = format!(
            "{}|{}|{}",
            expected_plan,
            LICENSE_DAYS,
            date.format("%Y%m%d")
        );
        mac.update(payload.as_bytes());
        let result = mac.finalize().into_bytes();

        // CORRECCIÓN DE AUDITORÍA: Aumentado de 3 a 8 bytes para prevenir fuerza bruta trivial
        if hex::encode(&result[..8]).to_uppercase() == parts[2].to_uppercase() {
            return true;
        }
    }
    false
}

pub fn activate_license(conn: &Connection, key: &str, plan: &str) -> Result<LicenseInfo> {
    if !validate_key(key, plan) {
        return Err(rusqlite::Error::InvalidParameterName(
            "Clave de activación inválida o expirada".into(),
        ));
    }

    conn.execute("UPDATE licenses SET active = 0 WHERE active = 1", [])?;

    let (max_users, modules) = get_plan_config(plan);

    let activated_at = Utc::now().date_naive();
    let expires_at = activated_at + Duration::days(LICENSE_DAYS);

    conn.execute(
        "INSERT INTO licenses (license_key, plan, expires_at, max_users) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![key, plan, expires_at.to_string(), max_users],
    )?;

    Ok(LicenseInfo {
        plan: plan.to_string(),
        activated: true,
        expires_at: expires_at.to_string(),
        max_users,
        days_left: LICENSE_DAYS,
        modules: modules.into_iter().map(String::from).collect(),
    })
}

pub fn activate_trial(conn: &Connection) -> Result<LicenseInfo> {
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM licenses WHERE active = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if exists {
        return Err(rusqlite::Error::InvalidParameterName(
            "Ya hay una licencia activa".into(),
        ));
    }

    let plan = "trial";
    let (max_users, modules) = get_plan_config(plan);

    let activated_at = Utc::now().date_naive();
    let expires_at = activated_at + Duration::days(TRIAL_DAYS);

    conn.execute(
        "INSERT INTO licenses (license_key, plan, expires_at, max_users) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params!["TRIAL-0000", plan, expires_at.to_string(), max_users],
    )?;

    Ok(LicenseInfo {
        plan: plan.to_string(),
        activated: true,
        expires_at: expires_at.to_string(),
        max_users,
        days_left: TRIAL_DAYS,
        modules: modules.into_iter().map(String::from).collect(),
    })
}

fn get_plan_config(plan: &str) -> (i64, Vec<&str>) {
    match plan {
        "trial" => (
            1,
            vec![
                "dashboard",
                "products",
                "pos",
                "purchases",
                "suppliers",
                "expenses",
                "receivables",
                "payroll",
                "cash",
                "reports",
                "backups",
                "users",
                "employees",
                "physical_inventory",
            ],
        ),
        "basico" | "ong" => (
            1,
            vec![
                "dashboard",
                "products",
                "pos",
                "purchases",
                "suppliers",
                "expenses",
                "receivables",
                "physical_inventory",
            ],
        ),
        "intermedio" => (
            2,
            vec![
                "dashboard",
                "products",
                "pos",
                "purchases",
                "suppliers",
                "expenses",
                "receivables",
                "payroll",
                "cash",
                "reports",
                "backups",
                "users",
                "physical_inventory",
            ],
        ),
        "avanzado" => (
            6,
            vec![
                "dashboard",
                "products",
                "pos",
                "purchases",
                "suppliers",
                "expenses",
                "receivables",
                "payroll",
                "cash",
                "reports",
                "backups",
                "users",
                "customization",
                "support",
                "physical_inventory",
                "employees",
                "services",
            ],
        ),
        _ => (0, vec![]),
    }
}

pub fn get_license_status(conn: &Connection) -> LicenseInfo {
    let row = conn.query_row(
        "SELECT plan, expires_at, max_users FROM licenses WHERE active = 1",
        [],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        },
    );

    match row {
        Ok((plan, expires_str, max_users)) => {
            let expire_date = NaiveDate::parse_from_str(&expires_str, "%Y-%m-%d")
                .unwrap_or_else(|_| NaiveDate::from_ymd_opt(1970, 1, 1).unwrap());
            let days_left = (expire_date - Utc::now().date_naive()).num_days().max(0);
            let modules = get_plan_config(&plan)
                .1
                .into_iter()
                .map(String::from)
                .collect();

            LicenseInfo {
                plan: plan.clone(),
                activated: days_left > 0,
                expires_at: expires_str,
                max_users,
                days_left,
                modules,
            }
        }
        Err(_) => LicenseInfo {
            plan: "none".to_string(),
            activated: false,
            expires_at: String::new(),
            max_users: 0,
            days_left: 0,
            modules: vec![],
        },
    }
}

#[cfg(test)]
pub fn generate_test_key(plan: &str, date_offset: i64) -> String {
    let prefix = plan_to_prefix(plan);
    let date = Utc::now().date_naive() - Duration::days(date_offset);
    let secret = crate::config::get_secret_key();
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    let payload = format!("{}|{}|{}", plan, LICENSE_DAYS, date.format("%Y%m%d"));
    mac.update(payload.as_bytes());
    let result = mac.finalize().into_bytes();
    let hex_sig = hex::encode(&result[..8]).to_uppercase();
    format!("KEY-{}-{}", prefix, hex_sig)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE licenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key TEXT NOT NULL UNIQUE,
                plan TEXT NOT NULL,
                activated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                expires_at TEXT NOT NULL,
                max_users INTEGER NOT NULL DEFAULT 1,
                active INTEGER NOT NULL DEFAULT 1
            );
        ",
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_license_key_generation_and_validation() {
        let plan = "basico";
        let key = generate_test_key(plan, 0);
        assert!(validate_key(&key, plan));
        assert!(!validate_key(&key, "avanzado"));
        assert!(!validate_key("INVALID-KEY", plan));
    }

    #[test]
    fn test_activate_license_valid() {
        let conn = setup_test_db();
        let plan = "intermedio";
        let key = generate_test_key(plan, 0);

        let info = activate_license(&conn, &key, plan).unwrap();
        assert_eq!(info.plan, plan);
        assert_eq!(info.max_users, 2);
        assert!(info.activated);

        let status = get_license_status(&conn);
        assert_eq!(status.plan, plan);
        assert!(status.activated);
        assert_eq!(status.days_left, 30);
    }

    #[test]
    fn test_activate_license_invalid() {
        let conn = setup_test_db();
        let res = activate_license(&conn, "BADKEY-INT-12345", "intermedio");
        assert!(res.is_err());
    }

    #[test]
    fn test_activate_trial() {
        let conn = setup_test_db();
        let info = activate_trial(&conn).unwrap();
        assert_eq!(info.plan, "trial");
        assert_eq!(info.days_left, 15);

        let res2 = activate_trial(&conn);
        assert!(res2.is_err());
    }

    #[test]
    fn test_invalid_expiration_date_handling() {
        let conn = setup_test_db();
        // Insert a row with an invalid date format
        conn.execute(
            "INSERT INTO licenses (license_key, plan, expires_at, max_users, active) VALUES ('KEY-123', 'basico', 'NOT-A-DATE', 1, 1)",
            [],
        ).unwrap();

        // This should not panic, but return status with 0 days left
        let status = get_license_status(&conn);
        assert_eq!(status.plan, "basico");
        assert_eq!(status.days_left, 0);
        assert!(!status.activated);
    }
}
