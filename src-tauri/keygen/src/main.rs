//! Keygen profesional para GestaSoftTech
//! 
//! Herramienta para gestionar licencias de clientes de GestaERP.
//! Permite generar, validar, listar y revocar claves de activación.
//!
//! Algoritmo: HMAC-SHA256(master_secret, plan | 30 | date)
//! Coincide exactamente con license.rs (LICENSE_DAYS=30).

use chrono::{NaiveDate, Duration, Local};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::io::{self, Write, BufRead};
use std::env;
use rusqlite::Connection;

const DEFAULT_MASTER_SECRET: &str = "GestaERP_2026_SecureKey_Colombia";
const SIGNATURE_BYTES: usize = 8;

/// Obtiene la clave maestra desde variable de entorno o usa el valor por defecto
fn get_master_secret() -> String {
    env::var("GESTAERP_SECRET_KEY").unwrap_or_else(|_| DEFAULT_MASTER_SECRET.to_string())
}

#[derive(Debug)]
struct LicenseRecord {
    id: i64,
    client_name: String,
    client_id: String,
    plan: String,
    license_key: String,
    max_users: i64,
    issued_at: String,
    expires_at: String,
    days: i64,
    active: bool,
}

fn open_keygen_db() -> Result<Connection, String> {
    let db_path = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("GestaSoftTech")
        .join("keygen.db");
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS license_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT, client_name TEXT NOT NULL,
            client_id TEXT NOT NULL, plan TEXT NOT NULL,
            license_key TEXT NOT NULL UNIQUE, max_users INTEGER NOT NULL DEFAULT 1,
            issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
            days INTEGER NOT NULL DEFAULT 30, active INTEGER NOT NULL DEFAULT 1, notes TEXT
        );"
    ).map_err(|e| e.to_string())?;
    Ok(conn)
}

struct PlanConfig {
    name: &'static str,
    max_users: i64,
    modules: &'static str,
}

fn get_plans() -> Vec<PlanConfig> {
    vec![
        PlanConfig { name: "ong", max_users: 1, modules: "dashboard,products,pos,purchases,suppliers,expenses,receivables,physical_inventory" },
        PlanConfig { name: "basico", max_users: 1, modules: "dashboard,products,pos,purchases,suppliers,expenses,receivables,physical_inventory" },
        PlanConfig { name: "intermedio", max_users: 3, modules: "dashboard,products,pos,purchases,suppliers,expenses,receivables,payroll,cash,reports,backups,users,physical_inventory" },
        PlanConfig { name: "avanzado", max_users: 10, modules: "dashboard,products,pos,purchases,suppliers,expenses,receivables,payroll,cash,reports,backups,users,customization,support,physical_inventory,employees,services" },
    ]
}

fn plan_to_prefix(plan: &str) -> &str {
    match plan {
        "basico" => "BAS", "intermedio" => "INT", "avanzado" => "AVZ", "ong" => "ONG",
        _ => "TST",
    }
}

/// Genera clave formato GESTA-{PREFIX}-{HMAC}
/// Payload: plan|30|fecha → mismo formato que license.rs (LICENSE_DAYS=30)
fn generate_license_key(plan: &str, issue_date: &NaiveDate) -> String {
    let prefix = plan_to_prefix(plan);
    let payload = format!("{}|{}|{}", plan, 30i64, issue_date.format("%Y%m%d"));
    let secret = get_master_secret();
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC key error");
    mac.update(payload.as_bytes());
    let sig = hex::encode(&mac.finalize().into_bytes()[..SIGNATURE_BYTES]).to_uppercase();
    format!("GESTA-{}-{}", prefix, sig)
}

fn validate_license_key(key: &str, plan: &str) -> bool {
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() != 3 || parts[1] != plan_to_prefix(plan) { return false; }
    let target = parts[2].to_uppercase();
    let today = Local::now().date_naive();
    for offset in 0..5 {
        let date = today - Duration::days(offset);
        let computed = generate_license_key(plan, &date);
        if computed.split('-').last().unwrap_or("").to_uppercase() == target {
            return true;
        }
    }
    false
}

fn issue_license(conn: &Connection, client_name: &str, client_id: &str, plan: &str, notes: Option<&str>) -> Result<LicenseRecord, String> {
    let plan_cfg = get_plans().into_iter().find(|p| p.name == plan)
        .ok_or_else(|| format!("Plan '{}' no válido. Usa: ong, basico, intermedio, avanzado", plan))?;
    let actual_days: i64 = 30; // Todos los planes 30 días (excepto trial=15)
    let issue_date = Local::now().date_naive();
    let expires_at = issue_date + Duration::days(actual_days);
    let license_key = generate_license_key(plan, &issue_date);
    conn.execute(
        "INSERT INTO license_records (client_name,client_id,plan,license_key,max_users,issued_at,expires_at,days,notes)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        rusqlite::params![client_name, client_id, plan, license_key, plan_cfg.max_users,
            issue_date.to_string(), expires_at.to_string(), actual_days, notes],
    ).map_err(|e| e.to_string())?;
    Ok(LicenseRecord {
        id: conn.last_insert_rowid(), client_name: client_name.to_string(),
        client_id: client_id.to_string(), plan: plan.to_string(), license_key,
        max_users: plan_cfg.max_users, issued_at: issue_date.to_string(),
        expires_at: expires_at.to_string(), days: actual_days, active: true,
    })
}

fn list_licenses(conn: &Connection, show_all: bool) -> Result<Vec<LicenseRecord>, String> {
    let filter = if show_all { "1=1" } else { "active = 1" };
    let query = format!(
        "SELECT id,client_name,client_id,plan,license_key,max_users,issued_at,expires_at,days,active
         FROM license_records WHERE {} ORDER BY issued_at DESC", filter
    );
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(LicenseRecord {
        id: row.get(0)?, client_name: row.get(1)?, client_id: row.get(2)?, plan: row.get(3)?,
        license_key: row.get(4)?, max_users: row.get(5)?, issued_at: row.get(6)?,
        expires_at: row.get(7)?, days: row.get(8)?, active: row.get(9)?,
    })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}

fn search_licenses(conn: &Connection, term: &str) -> Result<Vec<LicenseRecord>, String> {
    let pattern = format!("%{}%", term);
    let mut stmt = conn.prepare(
        "SELECT id,client_name,client_id,plan,license_key,max_users,issued_at,expires_at,days,active
         FROM license_records WHERE client_name LIKE ?1 OR client_id LIKE ?1 OR license_key LIKE ?1
         ORDER BY issued_at DESC LIMIT 50"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([&pattern], |row| Ok(LicenseRecord {
        id: row.get(0)?, client_name: row.get(1)?, client_id: row.get(2)?, plan: row.get(3)?,
        license_key: row.get(4)?, max_users: row.get(5)?, issued_at: row.get(6)?,
        expires_at: row.get(7)?, days: row.get(8)?, active: row.get(9)?,
    })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}

fn revoke_license(conn: &Connection, key_or_client: &str) -> Result<(), String> {
    let n = conn.execute(
        "UPDATE license_records SET active = 0 WHERE license_key = ?1 OR client_id = ?1",
        [key_or_client],
    ).map_err(|e| e.to_string())?;
    if n == 0 { return Err("No se encontró la licencia".to_string()); }
    println!("  ✓ {} licencia(s) revocada(s)", n);
    Ok(())
}

fn reactivate_license(conn: &Connection, key: &str) -> Result<(), String> {
    let n = conn.execute("UPDATE license_records SET active = 1 WHERE license_key = ?1", [key])
        .map_err(|e| e.to_string())?;
    if n == 0 { return Err("No se encontró la licencia".to_string()); }
    println!("  ✓ Licencia reactivada");
    Ok(())
}

fn export_csv(conn: &Connection, path: &str) -> Result<(), String> {
    let records = list_licenses(conn, true)?;
    let mut csv = String::from("ID,Cliente,ID Cliente,Plan,Clave,Max Usuarios,Emitida,Expira,Días,Activa\n");
    for r in &records {
        csv.push_str(&format!("{},{},{},{},{},{},{},{},{},{}\n",
            r.id, r.client_name, r.client_id, r.plan, r.license_key,
            r.max_users, r.issued_at, r.expires_at, r.days,
            if r.active { "Sí" } else { "No" }));
    }
    std::fs::write(path, csv).map_err(|e| e.to_string())?;
    println!("  ✓ {} registros exportados a {}", records.len(), path);
    Ok(())
}

fn show_stats(conn: &Connection) {
    let a: i64 = conn.query_row("SELECT COUNT(*) FROM license_records WHERE active=1", [], |r| r.get(0)).unwrap_or(0);
    let t: i64 = conn.query_row("SELECT COUNT(*) FROM license_records", [], |r| r.get(0)).unwrap_or(0);
    let e: i64 = conn.query_row("SELECT COUNT(*) FROM license_records WHERE active=1 AND date(expires_at)<=date('now','+30 days')", [], |r| r.get(0)).unwrap_or(0);
    let x: i64 = conn.query_row("SELECT COUNT(*) FROM license_records WHERE active=1 AND date(expires_at)<date('now')", [], |r| r.get(0)).unwrap_or(0);
    println!("\n  ╔══════════════════════════════╗");
    println!("  ║  ESTADÍSTICAS DE LICENCIAS  ║");
    println!("  ╠══════════════════════════════╣");
    println!("  ║ Activas:      {:>5}          ║", a);
    println!("  ║ Emitidas:     {:>5}          ║", t);
    println!("  ║ Expiran 30d:  {:>5}          ║", e);
    println!("  ║ Expiradas:    {:>5}          ║", x);
    println!("  ╚══════════════════════════════╝\n");
}

fn print_banner() {
    println!("\n  ╔═══════════════════════════════════════════╗");
    println!("  ║   GestaERP Keygen v2.0                    ║");
    println!("  ║   GestaSoftTech - Gestión de Licencias    ║");
    println!("  ║   Colombia, {}              ║", Local::now().format("%Y"));
    println!("  ╚═══════════════════════════════════════════╝\n");
}

fn print_help() {
    println!("  COMANDOS:");
    println!("    generar    - Emitir nueva licencia (30 días)");
    println!("    listar     - Licencias activas (listar -a = todas)");
    println!("    buscar <t> - Buscar cliente/clave");
    println!("    revocar <c>- Revocar licencia");
    println!("    validar <k> <plan> - Validar clave");
    println!("    stats      - Estadísticas");
    println!("    exportar   - CSV");
    println!("    planes     - Planes disponibles");
    println!("    ayuda      - Esta ayuda");
    println!("    salir      - Cerrar\n");
}

fn print_plans() {
    println!("\n  ╔══════════════════════════════════════════════════════╗");
    println!("  ║              PLANES (30 días c/u)                   ║");
    println!("  ╠══════════╦═══════════╦══════════════════════════════╣");
    println!("  ║ Plan     ║ Max Users ║ Módulos                     ║");
    println!("  ╠══════════╬═══════════╬══════════════════════════════╣");
    println!("  ║ ong      ║     1     ║ Básicos + Inventario        ║");
    println!("  ║ basico   ║     1     ║ Básicos + Inventario        ║");
    println!("  ║ intermedio║    3     ║ Completo (sin avanzados)    ║");
    println!("  ║ avanzado ║    10     ║ TODOS los módulos           ║");
    println!("  ╚══════════╩═══════════╩══════════════════════════════╝\n");
}

fn prompt(msg: &str) -> String {
    print!("  {}: ", msg);
    io::stdout().flush().ok();
    let mut line = String::new();
    io::stdin().lock().read_line(&mut line).ok();
    line.trim().to_string()
}

fn cmd_generate(conn: &Connection) {
    println!("  --- GENERAR NUEVA LICENCIA (30 días) ---");
    let client_name = prompt("Nombre del cliente / empresa");
    if client_name.is_empty() { println!("  ✗ Nombre requerido"); return; }
    let client_id = prompt("ID/NIT del cliente");
    if client_id.is_empty() { println!("  ✗ ID requerido"); return; }
    println!("  Planes: ong | basico | intermedio | avanzado");
    let plan = prompt("Plan").to_lowercase();
    if get_plans().iter().find(|p| p.name == plan).is_none() {
        println!("  ✗ Plan no válido"); return;
    }
    let notes = prompt("Notas (opcional)");
    let notes_opt = if notes.is_empty() { None } else { Some(notes.as_str()) };
    match issue_license(conn, &client_name, &client_id, &plan, notes_opt) {
        Ok(record) => {
            println!("\n  ╔══════════════════════════════════════╗");
            println!("  ║   LICENCIA GENERADA (30 días)       ║");
            println!("  ╠══════════════════════════════════════╣");
            println!("  ║ Cliente: {:<27} ║", truncate(&record.client_name, 27));
            println!("  ║ Plan:    {:<27} ║", format!("{} ({} usuarios)", record.plan, record.max_users));
            println!("  ║ Expira:  {:<27} ║", record.expires_at);
            println!("  ╠══════════════════════════════════════╣");
            println!("  ║ CLAVE:                              ║");
            println!("  ║ {:>36} ║", record.license_key);
            println!("  ╚══════════════════════════════════════╝\n");
            println!("  ✓ Entrega esta clave al cliente. La activación dura 30 días calendario.\n");
        }
        Err(e) => println!("  ✗ Error: {}", e),
    }
}

fn cmd_list(conn: &Connection, show_all: bool) {
    match list_licenses(conn, show_all) {
        Ok(records) => {
            if records.is_empty() { println!("  No hay licencias."); return; }
            println!("\n  {:<4} {:<20} {:<15} {:<10} {:<5} {:<12} {:<12} {:<6} {}",
                "ID","Cliente","NIT","Plan","Usu.","Emitida","Expira","Días","Estado");
            println!("  {}", "-".repeat(95));
            for r in &records {
                let st = if r.active { if r.expires_at<Local::now().date_naive().to_string(){"⚠EXP"}else{"✓ACT"} } else {"✗REV"};
                println!("  {:<4} {:<20} {:<15} {:<10} {:<5} {:<12} {:<12} {:<6} {}",
                    r.id, truncate(&r.client_name,20), r.client_id, r.plan, r.max_users,
                    r.issued_at, r.expires_at, r.days, st);
            }
            println!();
            for r in &records { if r.active { println!("    {} → {}", r.client_name, r.license_key); } }
            println!();
        }
        Err(e) => println!("  ✗ Error: {}", e),
    }
}

fn cmd_validate(_conn: &Connection, key: &str, plan: &str) {
    if validate_license_key(key, plan) {
        println!("  ✓ Clave VÁLIDA para plan '{}'", plan);
    } else {
        println!("  ✗ Clave INVÁLIDA o EXPIRADA");
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max { s.to_string() } else { format!("{}...", &s[..max-3]) }
}

fn main() {
    print_banner();
    let conn = match open_keygen_db() {
        Ok(c) => c,
        Err(e) => { eprintln!("  ✗ Error BD: {}", e); return; }
    };
    show_stats(&conn);
    print_help();
    loop {
        print!("  GestaKeygen> ");
        io::stdout().flush().ok();
        let mut line = String::new();
        if io::stdin().lock().read_line(&mut line).is_err() { break; }
        let parts: Vec<&str> = line.trim().split_whitespace().collect();
        if parts.is_empty() { continue; }
        match parts[0].to_lowercase().as_str() {
            "generar" | "nueva" | "new" => cmd_generate(&conn),
            "listar" | "list" | "ls" => cmd_list(&conn, parts.len()>1 && (parts[1]=="-a"||parts[1]=="--all")),
            "buscar" | "search" | "find" => {
                if parts.len()<2 { println!("  Uso: buscar <término>"); }
                else if let Ok(r) = search_licenses(&conn, parts[1]) {
                    for l in &r { println!("  [{}] {} - {} - Exp: {} - {}", if l.active{"✓"}else{"✗"}, l.client_name, l.plan, l.expires_at, l.license_key); }
                }
            }
            "revocar" | "revoke" => { if parts.len()>1 { let _=revoke_license(&conn, parts[1]); } else { println!("  Uso: revocar <clave>"); } }
            "reactivar" | "reactivate" => { if parts.len()>1 { let _=reactivate_license(&conn, parts[1]); } else { println!("  Uso: reactivar <clave>"); } }
            "validar" | "validate" | "check" => {
                if parts.len()<3 { println!("  Uso: validar <clave> <plan>"); }
                else { cmd_validate(&conn, parts[1], parts[2]); }
            }
            "stats" | "estadisticas" => show_stats(&conn),
            "exportar" | "export" => {
                let path = format!("licencias_gestaerp_{}.csv", Local::now().format("%Y%m%d_%H%M%S"));
                if let Err(e) = export_csv(&conn, &path) { println!("  ✗ {}", e); }
            }
            "planes" | "plans" => print_plans(),
            "ayuda" | "help" | "?" | "h" => print_help(),
            "salir" | "exit" | "quit" | "q" => { println!("  ¡Hasta luego! GestaSoftTech"); break; }
            "" => {}
            c => println!("  Comando '{}' no reconocido. Escribe 'ayuda'.", c),
        }
    }
}