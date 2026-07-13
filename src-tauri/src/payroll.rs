use rusqlite::{Connection, Result};
use serde::Serialize;
use chrono::{NaiveDate, Datelike};

const SMMLV_2026: f64 = 1_750_905.0;
const AUX_TRANSPORTE_2026: f64 = 249_095.0;

#[derive(Serialize, Debug, Clone)]
pub struct Employee {
    pub id: i64,
    pub name: String,
    pub doc_type: Option<String>,
    pub doc_number: Option<String>,
    pub position: Option<String>,
    pub base_salary: f64,
    pub transport_allowance: bool,
    pub has_social_security: bool,
    pub payment_frequency: String,
    pub risk_level: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub city: Option<String>,
    pub department: Option<String>,
    pub address: Option<String>,
    pub hire_date: Option<String>,
    pub eps: Option<String>,
    pub arl: Option<String>,
    pub afp: Option<String>,
    pub ccf: Option<String>,
    pub fondo_cesantias: Option<String>,
    pub active: bool,
}

#[derive(Serialize, Debug, Clone)]
pub struct PayrollEntry {
    pub id: i64,
    pub employee_id: i64,
    pub period: String,
    pub payment_frequency: String,
    pub days_worked: f64,
    pub basic_salary: f64,
    pub transport_allowance: f64,
    pub overtime_day_hours: f64,
    pub overtime_night_hours: f64,
    pub sunday_hours: f64,
    pub holiday_hours: f64,
    pub total_earnings: f64,
    pub health_deduction: f64,
    pub pension_deduction: f64,
    pub net_salary: f64,
    pub created_at: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct BenefitLoad {
    pub employee_id: i64,
    pub employee_name: String,
    pub base_salary: f64,
    pub health_employer: f64,
    pub pension_employer: f64,
    pub arl_cost: f64,
    pub ccf_cost: f64,
    pub sena_cost: f64,
    pub icbf_cost: f64,
    pub prima_provision: f64,
    pub cesantias_provision: f64,
    pub int_cesantias_provision: f64,
    pub vacaciones_provision: f64,
    pub total_employer_cost: f64,
}

pub fn create_employee(
    conn: &Connection,
    name: &str,
    doc_type: Option<&str>,
    doc_number: Option<&str>,
    position: Option<&str>,
    base_salary: f64,
    transport_allowance: bool,
    has_social_security: bool,
    payment_frequency: &str,
    risk_level: &str,
    phone: Option<&str>,
    email: Option<&str>,
    city: Option<&str>,
    department: Option<&str>,
    address: Option<&str>,
    hire_date: Option<&str>,
    eps: Option<&str>,
    arl: Option<&str>,
    afp: Option<&str>,
    ccf: Option<&str>,
    fondo_cesantias: Option<&str>,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO employees (name, doc_type, doc_number, position, base_salary, transport_allowance, has_social_security, payment_frequency, risk_level, phone, email, city, department, address, hire_date, eps, arl, afp, ccf, fondo_cesantias) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)",
        rusqlite::params![name, doc_type, doc_number, position, base_salary, transport_allowance as i64, has_social_security as i64, payment_frequency, risk_level, phone, email, city, department, address, hire_date, eps, arl, afp, ccf, fondo_cesantias],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_employees(conn: &Connection) -> Result<Vec<Employee>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, doc_type, doc_number, position, base_salary, transport_allowance, has_social_security, payment_frequency, risk_level, phone, email, city, department, address, hire_date, eps, arl, afp, ccf, fondo_cesantias, active FROM employees ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Employee {
            id: row.get(0)?, name: row.get(1)?, doc_type: row.get(2)?, doc_number: row.get(3)?,
            position: row.get(4)?, base_salary: row.get(5)?, transport_allowance: row.get::<_, i64>(6)? != 0,
            has_social_security: row.get::<_, i64>(7)? != 0,
            payment_frequency: row.get(8)?, risk_level: row.get(9)?,
            phone: row.get(10)?, email: row.get(11)?, city: row.get(12)?, department: row.get(13)?,
            address: row.get(14)?, hire_date: row.get(15)?, eps: row.get(16)?, arl: row.get(17)?,
            afp: row.get(18)?, ccf: row.get(19)?, fondo_cesantias: row.get(20)?, active: row.get::<_, i64>(21)? != 0,
        })
    })?;
    rows.collect()
}

pub fn update_employee(conn: &Connection, e: &Employee) -> Result<()> {
    conn.execute(
        "UPDATE employees SET name=?1,doc_type=?2,doc_number=?3,position=?4,base_salary=?5,transport_allowance=?6,has_social_security=?7,payment_frequency=?8,risk_level=?9,phone=?10,email=?11,city=?12,department=?13,address=?14,hire_date=?15,eps=?16,arl=?17,afp=?18,ccf=?19,fondo_cesantias=?20,active=?21 WHERE id=?22",
        rusqlite::params![e.name, e.doc_type, e.doc_number, e.position, e.base_salary, e.transport_allowance as i64, e.has_social_security as i64, e.payment_frequency, e.risk_level, e.phone, e.email, e.city, e.department, e.address, e.hire_date, e.eps, e.arl, e.afp, e.ccf, e.fondo_cesantias, e.active as i64, e.id],
    )?;
    Ok(())
}

pub fn delete_employee(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM employees WHERE id=?1", [id])?;
    Ok(())
}

/// Función pura que calcula la nómina para un empleado en un periodo dado.
pub fn compute_payroll(
    employee: &Employee,
    period: &str,
    overtime_hours: (f64, f64, f64, f64),
    total_days_month: f64,
) -> PayrollEntry {
    let (day_ot, night_ot, sunday_ot, holiday_ot) = overtime_hours;

    let days_worked = {
        let period_parts: Vec<&str> = period.split('-').collect();
        let year: i32 = period_parts.first().and_then(|s| s.parse().ok()).unwrap_or(2026);
        let month: u32 = period_parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);
        let first_day = NaiveDate::from_ymd_opt(year, month, 1)
            .unwrap_or_else(|| NaiveDate::from_ymd_opt(2026, 1, 1).unwrap());
        let last_day = if month == 12 {
            NaiveDate::from_ymd_opt(year + 1, 1, 1)
                .and_then(|d| d.pred_opt())
                .unwrap_or_else(|| NaiveDate::from_ymd_opt(2026, 12, 31).unwrap())
        } else {
            NaiveDate::from_ymd_opt(year, month + 1, 1)
                .and_then(|d| d.pred_opt())
                .unwrap_or_else(|| NaiveDate::from_ymd_opt(2026, 1, 31).unwrap())
        };

        if let Some(hire_str) = &employee.hire_date {
            if let Ok(hire_date) = NaiveDate::parse_from_str(hire_str, "%Y-%m-%d") {
                if hire_date > first_day {
                    (last_day - hire_date).num_days() as f64 + 1.0
                } else {
                    total_days_month
                }
            } else {
                total_days_month
            }
        } else {
            total_days_month
        }
    };

    let adjusted_days = match employee.payment_frequency.as_str() {
        "Diario" => 1.0,
        "Quincenal" => (days_worked / 2.0).ceil(),
        _ => days_worked,
    };

    let proportional_salary: f64 = (employee.base_salary * adjusted_days / total_days_month).round();
    let hourly_rate: f64 = proportional_salary / (adjusted_days * 8.0).max(1.0);

    let overtime_day_amount: f64 = (hourly_rate * 1.25 * day_ot).round();
    let overtime_night_amount: f64 = (hourly_rate * 1.75 * night_ot).round();
    let sunday_amount: f64 = (hourly_rate * 2.0 * sunday_ot).round();
    let holiday_amount: f64 = (hourly_rate * 2.0 * holiday_ot).round();

    let transport: f64 = if employee.has_social_security && employee.base_salary <= 2.0 * SMMLV_2026 {
        (AUX_TRANSPORTE_2026 * adjusted_days / total_days_month).round()
    } else {
        0.0
    };

    let total_earnings = proportional_salary + transport + overtime_day_amount + overtime_night_amount + sunday_amount + holiday_amount;

    let health_deduction: f64 = if employee.has_social_security { (proportional_salary * 0.04).round() } else { 0.0 };
    let pension_deduction: f64 = if employee.has_social_security { (proportional_salary * 0.04).round() } else { 0.0 };
    let net_salary = total_earnings - health_deduction - pension_deduction;

    PayrollEntry {
        id: 0,
        employee_id: employee.id,
        period: period.to_string(),
        payment_frequency: employee.payment_frequency.clone(),
        days_worked: adjusted_days,
        basic_salary: proportional_salary,
        transport_allowance: transport,
        overtime_day_hours: day_ot,
        overtime_night_hours: night_ot,
        sunday_hours: sunday_ot,
        holiday_hours: holiday_ot,
        total_earnings,
        health_deduction,
        pension_deduction,
        net_salary,
        created_at: String::new(),
    }
}

pub fn generate_payroll(
    conn: &Connection,
    period: &str,
    overtime_hours: &[(i64, f64, f64, f64, f64)],
) -> Result<Vec<PayrollEntry>> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM payroll_entries WHERE period = ?1",
        [period],
        |row| row.get(0),
    )?;
    if count > 0 {
        return Err(rusqlite::Error::InvalidParameterName(
            format!("Ya existe nómina generada para el periodo {}", period),
        ));
    }

    let employees = list_employees(conn)?;
    let mut entries = Vec::new();

    let period_parts: Vec<&str> = period.split('-').collect();
    let year: i32 = period_parts.first().and_then(|s| s.parse().ok()).unwrap_or(2026);
    let month: u32 = period_parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);
    let last_day = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
            .and_then(|d| d.pred_opt())
            .unwrap_or_else(|| NaiveDate::from_ymd_opt(2026, 12, 31).unwrap())
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
            .and_then(|d| d.pred_opt())
            .unwrap_or_else(|| NaiveDate::from_ymd_opt(2026, 1, 31).unwrap())
    };
    let total_days_month = last_day.day() as f64;

    for emp in &employees {
        if !emp.active { continue; }

        let ot = overtime_hours.iter()
            .find(|(id, _, _, _, _)| *id == emp.id)
            .map(|(_, d, n, s, h)| (*d, *n, *s, *h))
            .unwrap_or((0.0, 0.0, 0.0, 0.0));

        let entry = compute_payroll(emp, period, ot, total_days_month);

        conn.execute(
            "INSERT INTO payroll_entries (employee_id, period, payment_frequency, days_worked, basic_salary, transport_allowance, overtime_day_hours, overtime_night_hours, sunday_hours, holiday_hours, total_earnings, health_deduction, pension_deduction, net_salary) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            rusqlite::params![entry.employee_id, entry.period, entry.payment_frequency, entry.days_worked, entry.basic_salary, entry.transport_allowance, entry.overtime_day_hours, entry.overtime_night_hours, entry.sunday_hours, entry.holiday_hours, entry.total_earnings, entry.health_deduction, entry.pension_deduction, entry.net_salary],
        )?;

        entries.push(entry);
    }
    Ok(entries)
}

pub fn get_payroll_history(conn: &Connection, period: &str) -> Result<Vec<PayrollEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, employee_id, period, payment_frequency, days_worked, basic_salary, transport_allowance, overtime_day_hours, overtime_night_hours, sunday_hours, holiday_hours, total_earnings, health_deduction, pension_deduction, net_salary, created_at FROM payroll_entries WHERE period = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map([period], |row| {
        Ok(PayrollEntry {
            id: row.get(0)?, employee_id: row.get(1)?, period: row.get(2)?, payment_frequency: row.get(3)?,
            days_worked: row.get(4)?, basic_salary: row.get(5)?, transport_allowance: row.get(6)?,
            overtime_day_hours: row.get(7)?, overtime_night_hours: row.get(8)?,
            sunday_hours: row.get(9)?, holiday_hours: row.get(10)?,
            total_earnings: row.get(11)?, health_deduction: row.get(12)?,
            pension_deduction: row.get(13)?, net_salary: row.get(14)?,
            created_at: row.get(15)?,
        })
    })?;
    rows.collect()
}

pub fn calculate_benefit_load(employees: &[Employee]) -> Vec<BenefitLoad> {
    employees.iter().filter(|e| e.active).map(|emp| {
        let base = emp.base_salary;
        let health_employer: f64 = (base * 0.085).round();
        let pension_employer: f64 = (base * 0.12).round();
        let arl_rates: f64 = match emp.risk_level.as_str() {
            "I" => 0.00522, "II" => 0.01044, "III" => 0.02436, "IV" => 0.04350, "V" => 0.06960, _ => 0.00522,
        };
        let arl_cost: f64 = (base * arl_rates).round();
        let ccf_cost: f64 = (base * 0.04).round();
        let sena_cost: f64 = if base <= 10.0 * SMMLV_2026 { 0.0 } else { (base * 0.02).round() };
        let icbf_cost: f64 = if base <= 10.0 * SMMLV_2026 { 0.0 } else { (base * 0.03).round() };
        let prima_provision: f64 = (base * 0.0833).round();
        let cesantias_provision: f64 = (base * 0.0833).round();
        let int_cesantias_provision: f64 = (base * 0.01).round();
        let vacaciones_provision: f64 = (base * 0.0417).round();
        let total_employer_cost = health_employer + pension_employer + arl_cost + ccf_cost + sena_cost + icbf_cost + prima_provision + cesantias_provision + int_cesantias_provision + vacaciones_provision;

        BenefitLoad {
            employee_id: emp.id, employee_name: emp.name.clone(), base_salary: base,
            health_employer, pension_employer, arl_cost, ccf_cost,
            sena_cost, icbf_cost, prima_provision, cesantias_provision,
            int_cesantias_provision, vacaciones_provision, total_employer_cost,
        }
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empleado_prueba(base_salary: f64, transport: bool, social: bool, freq: &str, hire: Option<&str>) -> Employee {
        Employee {
            id: 1, name: "Test".into(), doc_type: Some("CC".into()), doc_number: Some("123".into()),
            position: Some("Analista".into()), base_salary, transport_allowance: transport,
            has_social_security: social, payment_frequency: freq.to_string(), risk_level: "I".into(),
            phone: None, email: None, city: Some("Bogotá".into()), department: Some("Cundinamarca".into()),
            address: None, hire_date: hire.map(|s| s.to_string()), eps: None, arl: None, afp: None, ccf: None,
            fondo_cesantias: None, active: true,
        }
    }

    #[test]
    fn test_salario_minimo_sin_horas_extra() {
        let emp = empleado_prueba(SMMLV_2026, true, true, "Mensual", None);
        let entry = compute_payroll(&emp, "2026-06", (0.0, 0.0, 0.0, 0.0), 30.0);
        assert_eq!(entry.days_worked, 30.0);
        assert!((entry.basic_salary - 1_750_905.0).abs() < 0.01);
        assert!((entry.transport_allowance - 249_095.0).abs() < 0.01);
        let expected_earnings: f64 = 1_750_905.0 + 249_095.0;
        assert!((entry.total_earnings - expected_earnings).abs() < 0.01);
        let expected_health: f64 = (1_750_905.0_f64 * 0.04_f64).round();
        assert!((entry.health_deduction - expected_health).abs() < 0.01);
        let expected_pension: f64 = (1_750_905.0_f64 * 0.04_f64).round();
        assert!((entry.pension_deduction - expected_pension).abs() < 0.01);
        let neto: f64 = expected_earnings - expected_health - expected_pension;
        assert!((entry.net_salary - neto).abs() < 0.01);
    }

    #[test]
    fn test_empleado_sin_seguridad_social_no_recibe_auxilio() {
        let emp = empleado_prueba(SMMLV_2026, true, false, "Mensual", None);
        let entry = compute_payroll(&emp, "2026-06", (0.0, 0.0, 0.0, 0.0), 30.0);
        assert_eq!(entry.transport_allowance, 0.0);
        assert_eq!(entry.health_deduction, 0.0);
        assert_eq!(entry.pension_deduction, 0.0);
    }

    #[test]
    fn test_horas_extra_diurnas() {
        let emp = empleado_prueba(2_000_000.0, true, true, "Mensual", None);
        let entry = compute_payroll(&emp, "2026-06", (2.0, 0.0, 0.0, 0.0), 30.0);
        let proportional_salary: f64 = 2_000_000.0;
        let hourly_rate: f64 = proportional_salary / (30.0 * 8.0);
        let overtime_amount: f64 = (hourly_rate * 1.25 * 2.0).round();
        let transport: f64 = 249_095.0;
        let expected_total: f64 = proportional_salary + transport + overtime_amount;
        assert!((entry.overtime_day_hours - 2.0).abs() < 0.1);
        let diff = (entry.total_earnings - expected_total).abs();
        assert!(diff < 1.0, "Diferencia en total devengado: {}", diff);
    }

    #[test]
    fn test_benefit_load_calculos() {
        let emp = empleado_prueba(2_000_000.0, false, true, "Mensual", None);
        let loads = calculate_benefit_load(&[emp]);
        let load = &loads[0];
        assert!((load.health_employer - ((2_000_000.0_f64 * 0.085_f64).round() as f64)).abs() < 0.01);
        assert!((load.pension_employer - ((2_000_000.0_f64 * 0.12_f64).round() as f64)).abs() < 0.01);
        assert!((load.arl_cost - ((2_000_000.0_f64 * 0.00522_f64).round() as f64)).abs() < 0.01);
        assert!((load.ccf_cost - ((2_000_000.0_f64 * 0.04_f64).round() as f64)).abs() < 0.01);
        assert_eq!(load.sena_cost, 0.0);
        assert_eq!(load.icbf_cost, 0.0);
    }

    #[test]
    fn test_generate_payroll_duplicates_prevented() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("
            CREATE TABLE employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                doc_type TEXT,
                doc_number TEXT,
                position TEXT,
                base_salary REAL NOT NULL,
                transport_allowance INTEGER,
                has_social_security INTEGER,
                payment_frequency TEXT,
                risk_level TEXT,
                phone TEXT,
                email TEXT,
                city TEXT,
                department TEXT,
                address TEXT,
                hire_date TEXT,
                eps TEXT,
                arl TEXT,
                afp TEXT,
                ccf TEXT,
                fondo_cesantias TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE payroll_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                period TEXT NOT NULL,
                payment_frequency TEXT,
                days_worked REAL,
                basic_salary REAL NOT NULL,
                transport_allowance REAL,
                overtime_day_hours REAL,
                overtime_night_hours REAL,
                sunday_hours REAL,
                holiday_hours REAL,
                total_earnings REAL NOT NULL,
                health_deduction REAL,
                pension_deduction REAL,
                net_salary REAL NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            INSERT INTO employees (name, doc_type, doc_number, position, base_salary, transport_allowance, has_social_security, payment_frequency, risk_level, phone, email, city, department, address, hire_date, eps, arl, afp, ccf, fondo_cesantias, active) 
            VALUES ('Emp Test', 'CC', '123', 'Empleado', 2000000.0, 0, 1, 'Mensual', 'I', '', '', '', '', '', '', '', '', '', '', NULL, 1);
        ").unwrap();

        let period = "2026-06";
        let overtime = vec![(1, 0.0, 0.0, 0.0, 0.0)];
        let res1 = generate_payroll(&conn, period, &overtime);
        assert!(res1.is_ok());
        let res2 = generate_payroll(&conn, period, &overtime);
        assert!(res2.is_err());
    }

    #[test]
    fn test_invalid_period_does_not_panic() {
        let emp = empleado_prueba(SMMLV_2026, true, true, "Mensual", None);
        let entry = compute_payroll(&emp, "INVALID-DATE", (0.0, 0.0, 0.0, 0.0), 30.0);
        assert_eq!(entry.period, "INVALID-DATE");
    }
}