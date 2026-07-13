use hmac::{Hmac, Mac};
use sha2::Sha256;
use chrono::Utc;
use std::env;

const DEFAULT_SECRET_KEY: &str = "GestaERP_2026_SecureKey_Colombia";
const LICENSE_DAYS: i64 = 30;

/// Obtiene la clave secreta desde variable de entorno o usa el valor por defecto
fn get_secret_key() -> String {
    env::var("GESTAERP_SECRET_KEY").unwrap_or_else(|_| DEFAULT_SECRET_KEY.to_string())
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

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 || args.len() > 3 {
        eprintln!("=== GENERADOR DE LLAVES GESTAERP ===");
        eprintln!("USO: cargo run --bin generate_keys <plan> [dias]");
        eprintln!("");
        eprintln!("PLANES DISPONIBLES:");
        eprintln!("  ong         → ONG / Fundación (1 usuario)");
        eprintln!("  basico      → Básico (1 usuario)");
        eprintln!("  intermedio  → Intermedio (2 usuarios)");
        eprintln!("  avanzado    → Avanzado (6 usuarios)");
        eprintln!("");
        eprintln!("EJEMPLOS:");
        eprintln!("  cargo run --bin generate_keys avanzado");
        eprintln!("    → Genera clave para plan Avanzado (30 días)");
        eprintln!("  cargo run --bin generate_keys basico 90");
        eprintln!("    → Genera clave para plan Básico (90 días)");
        eprintln!("");
        eprintln!("Las claves generadas son válidas por 5 días desde su creación.");
        std::process::exit(1);
    }
    let plan = &args[1];
    let days: i64 = if args.len() == 3 {
        args[2].parse().unwrap_or(LICENSE_DAYS)
    } else {
        LICENSE_DAYS
    };
    
    println!("");
    println!("🔑 LLAVE GENERADA:");
    println!("━━━━━━━━━━━━━━━━━━━");
    
    let secret = get_secret_key();
    for offset in 0..5 {
        let date = Utc::now().date_naive() - chrono::Duration::days(offset);
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        let payload = format!("{}|{}|{}", plan, days, date.format("%Y%m%d"));
        mac.update(payload.as_bytes());
        let result = mac.finalize().into_bytes();
        let code = hex::encode(&result[..8]).to_uppercase();
        let key = format!("GESTA-{}-{}", plan_to_prefix(plan), code);
        if offset == 0 {
            println!("  ✅ {}  ← USAR ESTA", key);
        } else {
            println!("     {}", key);
        }
    }
    
    println!("━━━━━━━━━━━━━━━━━━━");
    println!("Plan: {} | Duración: {} días", plan, days);
    println!("");
    println!("📌 INSTRUCCIONES:");
    println!("1. Copia la primera llave (marcada con ✅)");
    println!("2. En GestaERP, ve a Licencias → Activar plan");
    println!("3. Pega la llave y haz clic en Activar");
    println!("");
}