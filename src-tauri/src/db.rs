use rusqlite::{Connection, Result};
use argon2::{
    password_hash::{PasswordHasher, SaltString, PasswordHash, PasswordVerifier},
    Argon2,
};
use rand::rngs::OsRng;
use serde::Serialize;
use std::fmt;

// ---------- Wrapper para errores de argon2 ----------
#[derive(Debug)]
struct HashError(String);

impl fmt::Display for HashError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for HashError {}

// ---------- Estructuras de datos ----------
#[derive(Serialize)]
pub struct DashboardStats {
    pub caja_actual: f64,
    pub productos_bajos: i64,
    pub ventas_hoy: f64,
    pub gastos_hoy: f64,
    pub ventas_ultimos_7_dias: Vec<f64>,
    pub ventas_ultimos_30_dias: Vec<f64>,
    pub ventas_por_mes_6: Vec<(String, f64)>,
    pub total_clientes: i64,
    pub total_proveedores: i64,
    pub cantidad_ventas_hoy: i64,
    pub producto_mas_vendido_mes: Option<ProductoEstrella>,
    pub compras_mes: f64,
    pub producto_mas_comprado_mes: Option<ProductoEstrella>,
    pub ventas_mes: f64,
    pub gastos_mes: f64,
    pub metodos_pago: Vec<(String, f64)>,
    pub top_productos_mes: Vec<(String, f64)>,
    pub productos_activos: i64,
    pub servicios_activos: i64,
    pub compras_realizadas: i64,
    pub proveedores_activos: i64,
    pub empleados_activos: i64,
}

#[derive(Serialize)]
pub struct ProductoEstrella {
    pub name: String,
    pub total_vendido: f64,
}

/// Delega la derivación de clave al módulo crypto (C1+C3):
///   machine_id = hostname|username
///   db_key = HMAC-SHA256(pepper, SHA-256(machine_id))
/// Cada instalación tiene una clave distinta.
fn derive_machine_key() -> String {
    crate::crypto::derive_db_key()
}

// ---------- Apertura de base de datos ----------
pub fn open_database() -> Result<Connection> {
    let data_dir = dirs::data_dir().expect("No se pudo encontrar el directorio de datos del sistema");
    let app_dir = data_dir.join("GestaERP");
    std::fs::create_dir_all(&app_dir).expect("No se pudo crear el directorio de la base de datos");
    
    let db_path = app_dir.join("gestaerp.db");
    let conn = Connection::open(&db_path)?;
    
    // P1-04 FIX: Activar integridad referencial (FOREIGN KEY enforcement)
    // y timeout de bloqueo para operaciones concurrentes.
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")?;
    
    // Clave derivada de la máquina: cada PC tiene una clave única.
    // NOTA P0-06: con `rusqlite` estándar (sin feature "sqlcipher"), PRAGMA key se IGNORA.
    // Para activar cifrado real: usar features = ["bundled", "sqlcipher"] en Cargo.toml.
    let machine_key = derive_machine_key();
    let _ = conn.pragma_update(None, "key", &machine_key);
    
    // Si la BD es nueva (no existía), la clave se establece automáticamente.
    // Si ya existía y la clave no coincide, el SELECT fallará con error de "file is not a database"
    conn.execute_batch("SELECT count(*) FROM sqlite_master")
        .map_err(|e| rusqlite::Error::InvalidParameterName(format!("Error de lectura de BD (¿clave incorrecta? - posiblemente BD de otra máquina o corrupta): {}", e)))?;
    
    Ok(conn)
}

// ---------- Configuración (settings) ----------
pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get(0),
    ).ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

// ---------- Autenticación ----------
pub fn verify_password(conn: &Connection, username: &str, password: &str) -> Result<bool, String> {
    let stored_hash: String = conn.query_row(
        "SELECT password FROM users WHERE username = ?1 AND active = 1",
        [username],
        |row| row.get(0),
    ).map_err(|e| format!("Usuario no encontrado: {}", e))?;

    let parsed_hash = PasswordHash::new(&stored_hash)
        .map_err(|e| format!("Error al leer hash: {}", e))?;

    if Argon2::default().verify_password(password.as_bytes(), &parsed_hash).is_ok() {
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn get_user_info(conn: &Connection, username: &str) -> Option<(i64, String, String)> {
    conn.query_row(
        "SELECT id, full_name, role FROM users WHERE username = ?1 AND active = 1",
        [username],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).ok()
}

// ---------- Dashboard ----------
pub fn get_dashboard_stats(conn: &Connection) -> Result<DashboardStats> {
    let caja_actual = match conn.query_row(
        "SELECT current_balance FROM cash_registers WHERE status = 'open' ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0),
    ) {
        Ok(val) => val,
        Err(rusqlite::Error::QueryReturnedNoRows) => 0.0,
        Err(e) => return Err(e),
    };

    let productos_bajos = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE active = 1 AND stock <= min_stock",
        [],
        |row| row.get(0),
    )?;

    let ventas_hoy = conn.query_row(
        "SELECT COALESCE(SUM(total), 0) FROM sales WHERE date(created_at) = date('now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let gastos_hoy = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE date(created_at) = date('now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let cantidad_ventas_hoy = conn.query_row(
        "SELECT COUNT(*) FROM sales WHERE date(created_at) = date('now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let total_clientes = conn.query_row(
        "SELECT COUNT(*) FROM customers",
        [],
        |row| row.get(0),
    )?;

    let total_proveedores = conn.query_row(
        "SELECT COUNT(*) FROM suppliers",
        [],
        |row| row.get(0),
    )?;

    let ventas_mes = conn.query_row(
        "SELECT COALESCE(SUM(total), 0) FROM sales WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let gastos_mes = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let compras_mes = conn.query_row(
        "SELECT COALESCE(SUM(total), 0) FROM purchases WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')",
        [],
        |row| row.get(0),
    )?;

    let mut ventas_ultimos_7_dias = Vec::new();
    for i in 0..7 {
        let date_offset = format!("-{} day", i);
        let total: f64 = conn.query_row(
            "SELECT COALESCE(SUM(total), 0) FROM sales WHERE date(created_at) = date('now', 'localtime', ?1)",
            [&date_offset],
            |row| row.get(0),
        )?;
        ventas_ultimos_7_dias.push(total);
    }

    let producto_mas_vendido_mes = match conn.query_row(
        "SELECT p.name, SUM(si.quantity) as total_vendido FROM sale_items si JOIN products p ON p.id = si.product_id JOIN sales s ON s.id = si.sale_id WHERE strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime') GROUP BY si.product_id ORDER BY total_vendido DESC LIMIT 1",
        [],
        |row| Ok(ProductoEstrella { name: row.get(0)?, total_vendido: row.get(1)? }),
    ) {
        Ok(p) => Some(p),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(e) => return Err(e),
    };

    let producto_mas_comprado_mes = match conn.query_row(
        "SELECT pi.product_name as name, SUM(pi.quantity) as total_vendido FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id WHERE strftime('%Y-%m', pu.created_at) = strftime('%Y-%m', 'now', 'localtime') GROUP BY pi.product_id ORDER BY total_vendido DESC LIMIT 1",
        [],
        |row| Ok(ProductoEstrella { name: row.get(0)?, total_vendido: row.get(1)? }),
    ) {
        Ok(p) => Some(p),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(e) => return Err(e),
    };

    // Nuevos campos para dashboard profesional
    let productos_activos = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE active = 1",
        [], |row| row.get(0),
    )?;

    let servicios_activos = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE active = 1 AND price > 0 AND (unit = 'SERVICIO' OR unit = 'HORA' OR unit = 'DÍA')",
        [], |row| row.get(0),
    )?;

    let compras_realizadas = conn.query_row(
        "SELECT COUNT(*) FROM purchases",
        [], |row| row.get(0),
    )?;

    let proveedores_activos_sql = conn.query_row(
        "SELECT COUNT(*) FROM suppliers",
        [], |row| row.get(0),
    )?;

    let empleados_activos = conn.query_row(
        "SELECT COUNT(*) FROM employees WHERE active = 1",
        [], |row| row.get(0),
    )?;

    // Ventas últimos 30 días
    let mut ventas_ultimos_30_dias = Vec::new();
    for i in 0..30 {
        let date_offset = format!("-{} day", i);
        let total: f64 = conn.query_row(
            "SELECT COALESCE(SUM(total), 0) FROM sales WHERE date(created_at) = date('now', 'localtime', ?1)",
            [&date_offset], |row| row.get(0),
        )?;
        ventas_ultimos_30_dias.push(total);
    }

    // Ventas por mes (últimos 6 meses)
    let mut ventas_por_mes_6 = Vec::new();
    for i in 0..6 {
        let month_offset = format!("-{} month", i);
        let (mes, total): (String, f64) = conn.query_row(
            "SELECT strftime('%Y-%m', 'now', 'localtime', ?1) as mes, COALESCE(SUM(total), 0) FROM sales WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime', ?1)",
            [&month_offset], |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        ventas_por_mes_6.push((mes, total));
    }

    // Métodos de pago del mes
    let mut stmt = conn.prepare(
        "SELECT payment_method, COUNT(*) as cnt FROM sales WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime') GROUP BY payment_method"
    ).map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
    let metodos_pago: Vec<(String, f64)> = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?.collect::<Result<Vec<_>, _>>()?;

    // Top 5 productos del mes
    let mut stmt = conn.prepare(
        "SELECT p.name, SUM(si.quantity) as total_vendido FROM sale_items si JOIN products p ON p.id = si.product_id JOIN sales s ON s.id = si.sale_id WHERE strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime') GROUP BY si.product_id ORDER BY total_vendido DESC LIMIT 5"
    ).map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
    let top_productos_mes: Vec<(String, f64)> = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(DashboardStats {
        caja_actual,
        productos_bajos,
        ventas_hoy,
        gastos_hoy,
        ventas_ultimos_7_dias,
        ventas_ultimos_30_dias,
        ventas_por_mes_6,
        total_clientes,
        total_proveedores,
        cantidad_ventas_hoy,
        producto_mas_vendido_mes,
        compras_mes,
        producto_mas_comprado_mes,
        ventas_mes,
        gastos_mes,
        metodos_pago,
        top_productos_mes,
        productos_activos,
        servicios_activos,
        compras_realizadas,
        proveedores_activos: proveedores_activos_sql,
        empleados_activos,
    })
}

// ---------- Migraciones ----------

/// Migración inicial: crea todas las tablas y aplica los ALTER de compatibilidad
const MIGRATION_001_INITIAL: &str = r#"
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    full_name  TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'cashier',
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS suppliers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    nit        TEXT,
    phone      TEXT,
    email      TEXT,
    doc_type   TEXT DEFAULT 'NIT',
    city       TEXT DEFAULT '',
    address    TEXT DEFAULT '',
    payment_method TEXT DEFAULT 'Transferencia',
    bank_account TEXT DEFAULT '',
    iva_responsible INTEGER DEFAULT 0,
    offers_credit INTEGER DEFAULT 0,
    credit_days INTEGER DEFAULT 0,
    credit_limit REAL DEFAULT 0.0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS customers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    doc_type   TEXT DEFAULT 'CC',
    doc_number TEXT,
    phone      TEXT,
    email      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sku         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    price       REAL NOT NULL,
    cost        REAL NOT NULL DEFAULT 0,
    stock       REAL NOT NULL DEFAULT 0,
    min_stock   REAL NOT NULL DEFAULT 0,
    max_stock   REAL NOT NULL DEFAULT 0,
    iva_percent REAL NOT NULL DEFAULT 0,
    unit        TEXT DEFAULT 'UNIDAD',
    active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cash_registers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    open_date  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    close_date TEXT,
    initial_balance REAL NOT NULL DEFAULT 0,
    current_balance REAL NOT NULL DEFAULT 0,
    final_balance   REAL,
    status     TEXT NOT NULL DEFAULT 'open',
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL,
    movement_type TEXT NOT NULL,
    quantity    REAL NOT NULL,
    unit_price  REAL,
    reason      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS sales (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    customer_id     INTEGER,
    total           REAL NOT NULL,
    payment_method  TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id     INTEGER NOT NULL,
    product_id  INTEGER NOT NULL,
    quantity    REAL NOT NULL,
    unit_price  REAL NOT NULL,
    total_price REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS purchases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    supplier_id INTEGER,
    supplier_name TEXT NOT NULL DEFAULT 'Proveedor',
    invoice_number TEXT DEFAULT '',
    total       REAL NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    product_id  INTEGER,
    product_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    quantity    REAL NOT NULL,
    unit_cost   REAL NOT NULL,
    total_cost  REAL NOT NULL,
    iva_percent REAL DEFAULT 0,
    unit        TEXT DEFAULT 'UNIDAD',
    FOREIGN KEY (purchase_id) REFERENCES purchases(id)
);

CREATE TABLE IF NOT EXISTS expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    description TEXT NOT NULL,
    amount      REAL NOT NULL,
    category    TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Efectivo',
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    supplier_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS receivables (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    sale_id     INTEGER NOT NULL,
    total       REAL NOT NULL,
    paid        REAL NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS receivable_payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    receivable_id INTEGER NOT NULL,
    amount      REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Efectivo',
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (receivable_id) REFERENCES receivables(id)
);

CREATE TABLE IF NOT EXISTS employees (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    doc_type        TEXT DEFAULT 'CC',
    doc_number      TEXT,
    position        TEXT DEFAULT 'Empleado',
    base_salary     REAL NOT NULL,
    transport_allowance INTEGER DEFAULT 0,
    payment_frequency TEXT DEFAULT 'Mensual',
    risk_level      TEXT DEFAULT 'I',
    phone           TEXT DEFAULT '',
    email           TEXT DEFAULT '',
    city            TEXT DEFAULT '',
    address         TEXT DEFAULT '',
    hire_date       TEXT DEFAULT '',
    eps             TEXT DEFAULT '',
    arl             TEXT DEFAULT '',
    afp             TEXT DEFAULT '',
    ccf             TEXT DEFAULT '',
    has_social_security INTEGER DEFAULT 0,
    department      TEXT DEFAULT '',
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS payroll_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL,
    period          TEXT NOT NULL,
    payment_frequency TEXT DEFAULT 'Mensual',
    days_worked     REAL DEFAULT 30,
    basic_salary    REAL NOT NULL,
    transport_allowance REAL DEFAULT 0,
    overtime_day_hours REAL DEFAULT 0,
    overtime_night_hours REAL DEFAULT 0,
    sunday_hours    REAL DEFAULT 0,
    holiday_hours   REAL DEFAULT 0,
    total_earnings  REAL NOT NULL,
    health_deduction REAL DEFAULT 0,
    pension_deduction REAL DEFAULT 0,
    net_salary      REAL NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS licenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL UNIQUE,
    plan        TEXT NOT NULL,
    activated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    expires_at  TEXT NOT NULL,
    max_users   INTEGER NOT NULL DEFAULT 1,
    active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS physical_counts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'borrador',
    notes       TEXT DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS physical_count_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id        INTEGER NOT NULL,
    product_id      INTEGER NOT NULL,
    theoretical_qty REAL NOT NULL DEFAULT 0,
    counted_qty     REAL NOT NULL DEFAULT 0,
    difference      REAL NOT NULL DEFAULT 0,
    adjusted        INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (count_id) REFERENCES physical_counts(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('iva_responsable', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('department', 'CUNDINAMARCA');
INSERT OR IGNORE INTO settings (key, value) VALUES ('license_plan', 'none');
"#;

/// Aplica las migraciones pendientes según la versión almacenada en `schema_migrations`
fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )",
        [],
    )?;

    let current_version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let migrations: Vec<(i32, &str, &str)> = vec![
        (1, "Esquema inicial completo", MIGRATION_001_INITIAL),
        (2, "Cotizaciones (v1.1)", MIGRATION_002_QUOTATIONS),
        (3, "Cuentas por pagar (v1.2)", MIGRATION_003_PAYABLES),
        (4, "Auditoría (v2.0)", MIGRATION_004_AUDIT),
        (5, "Cierre contable (v2.0)", MIGRATION_005_CLOSURES),
        (6, "Consecutivos (v2.0)", MIGRATION_006_NUMBERING),
        (7, "Auditoría schema + índices + multi-tenancy (v2.1)", MIGRATION_007_AUDIT_SCHEMA),
    ];

    for (version, description, sql) in &migrations {
        if *version > current_version {
            println!("Aplicando migración {}: {}", version, description);
            conn.execute_batch(sql)?;
            conn.execute(
                "INSERT INTO schema_migrations (version) VALUES (?1)",
                [*version],
            )?;
            println!("Migración {} aplicada correctamente.", version);
        }
    }

    // CORRECCIÓN DE AUDITORÍA: Manejar errores de ALTER adecuadamente
    let alters = [
        "ALTER TABLE suppliers ADD COLUMN doc_type TEXT DEFAULT 'NIT'",
        "ALTER TABLE suppliers ADD COLUMN city TEXT DEFAULT ''",
        "ALTER TABLE suppliers ADD COLUMN address TEXT DEFAULT ''",
        "ALTER TABLE suppliers ADD COLUMN payment_method TEXT DEFAULT 'Transferencia'",
        "ALTER TABLE suppliers ADD COLUMN bank_account TEXT DEFAULT ''",
        "ALTER TABLE suppliers ADD COLUMN iva_responsible INTEGER DEFAULT 0",
        "ALTER TABLE suppliers ADD COLUMN offers_credit INTEGER DEFAULT 0",
        "ALTER TABLE suppliers ADD COLUMN credit_days INTEGER DEFAULT 0",
        "ALTER TABLE suppliers ADD COLUMN credit_limit REAL DEFAULT 0.0",
        "ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'UNIDAD'",
        "ALTER TABLE purchases ADD COLUMN invoice_number TEXT DEFAULT ''",
        "ALTER TABLE purchase_items ADD COLUMN product_name TEXT DEFAULT ''",
        "ALTER TABLE purchase_items ADD COLUMN description TEXT DEFAULT ''",
        "ALTER TABLE purchase_items ADD COLUMN iva_percent REAL DEFAULT 0",
        "ALTER TABLE purchase_items ADD COLUMN unit TEXT DEFAULT 'UNIDAD'",
        "ALTER TABLE customers ADD COLUMN doc_type TEXT DEFAULT 'CC'",
        "ALTER TABLE cash_registers ADD COLUMN current_balance REAL NOT NULL DEFAULT 0",
        "ALTER TABLE employees ADD COLUMN phone TEXT DEFAULT ''",
        "ALTER TABLE employees ADD COLUMN email TEXT DEFAULT ''",
        "ALTER TABLE employees ADD COLUMN city TEXT DEFAULT ''",
        "ALTER TABLE employees ADD COLUMN address TEXT DEFAULT ''",
        "ALTER TABLE employees ADD COLUMN hire_date TEXT DEFAULT ''",
        "ALTER TABLE employees ADD COLUMN eps TEXT DEFAULT ''",
        "ALTER TABLE employees ADD COLUMN arl TEXT DEFAULT ''",
        "ALTER TABLE employees ADD COLUMN afp TEXT DEFAULT ''",
        "ALTER TABLE employees ADD COLUMN ccf TEXT DEFAULT ''",
        "ALTER TABLE employees ADD COLUMN payment_frequency TEXT DEFAULT 'Mensual'",
        "ALTER TABLE employees ADD COLUMN risk_level TEXT DEFAULT 'I'",
        "ALTER TABLE employees ADD COLUMN has_social_security INTEGER DEFAULT 0",
        "ALTER TABLE employees ADD COLUMN department TEXT DEFAULT ''",
        "ALTER TABLE payroll_entries ADD COLUMN payment_frequency TEXT DEFAULT 'Mensual'",
        "ALTER TABLE payroll_entries ADD COLUMN days_worked REAL DEFAULT 30",
        "ALTER TABLE licenses ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE expenses ADD COLUMN supplier_id INTEGER",
        "ALTER TABLE expenses ADD COLUMN supplier_name TEXT DEFAULT ''",
        "ALTER TABLE suppliers ADD COLUMN bank_name TEXT DEFAULT ''",
        // ============================================================
        // MIGRACIÓN 007: Timestamps y Soft Delete para auditoría
        // ============================================================
        "ALTER TABLE products ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'))",
        "ALTER TABLE products ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE products ADD COLUMN deleted_at TEXT",
        "ALTER TABLE sale_items ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'))",
        "ALTER TABLE sale_items ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE purchase_items ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'))",
        "ALTER TABLE purchase_items ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE sales ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE sales ADD COLUMN deleted_at TEXT",
        "ALTER TABLE purchases ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE purchases ADD COLUMN deleted_at TEXT",
        "ALTER TABLE expenses ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE expenses ADD COLUMN deleted_at TEXT",
        "ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN deleted_at TEXT",
        "ALTER TABLE customers ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE customers ADD COLUMN deleted_at TEXT",
        "ALTER TABLE suppliers ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE suppliers ADD COLUMN deleted_at TEXT",
        "ALTER TABLE employees ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE employees ADD COLUMN deleted_at TEXT",
        "ALTER TABLE receivables ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE receivables ADD COLUMN deleted_at TEXT",
        "ALTER TABLE receivable_payments ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE physical_count_items ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'))",
        "ALTER TABLE physical_count_items ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE quotation_items ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'))",
        "ALTER TABLE quotation_items ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE inventory_movements ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE physical_counts ADD COLUMN updated_at TEXT DEFAULT ''",
        "ALTER TABLE cash_registers ADD COLUMN updated_at TEXT DEFAULT ''",
        // ============================================================
        // MIGRACIÓN 007: empresa_id para multi-tenancy futuro
        // ============================================================
        "ALTER TABLE users ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE products ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE sales ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE purchases ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE expenses ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE customers ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE suppliers ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE employees ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE cash_registers ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE receivables ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE payables ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE quotations ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE physical_counts ADD COLUMN empresa_id INTEGER DEFAULT 1",
        "ALTER TABLE inventory_movements ADD COLUMN empresa_id INTEGER DEFAULT 1",
    ];

    for alter in alters {
        if let Err(e) = conn.execute(alter, []) {
            let err_msg = e.to_string();
            if !err_msg.contains("duplicate column") {
                eprintln!("ERROR CRÍTICO EN MIGRACIÓN ALTER: {} - {}", alter, e);
                return Err(e);
            }
        }
    }

    Ok(())
}

fn create_default_admin(_conn: &Connection) -> Result<()> {
    // No se crean usuarios administrativos con credenciales fijas ni predecibles.
    // El primer administrador se crea mediante un flujo explícito y seguro en la
    // pantalla de configuración inicial.
    Ok(())
}

pub fn init_db() -> Result<Connection> {
    let conn = open_database()?;
    run_migrations(&conn)?;
    crate::calendar_notes::create_table(&conn)?;
    crate::implementation::create_table(&conn)?;
    create_default_admin(&conn)?;
    Ok(conn)
}

const MIGRATION_002_QUOTATIONS: &str = r#"
CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consecutive TEXT NOT NULL UNIQUE,
    date TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    due_date TEXT,
    customer_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_doc TEXT,
    items TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    iva_percent REAL NOT NULL DEFAULT 0,
    iva_amount REAL NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    observations TEXT,
    status TEXT NOT NULL DEFAULT 'Borrador',
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quotation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    description TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    iva_percent REAL NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(date);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
"#;

const MIGRATION_003_PAYABLES: &str = r#"
CREATE TABLE IF NOT EXISTS payables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    supplier_name TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    balance REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pendiente',
    observations TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payable_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payable_id INTEGER NOT NULL,
    payment_date TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Efectivo',
    reference TEXT,
    observations TEXT,
    created_by INTEGER NOT NULL,
    FOREIGN KEY (payable_id) REFERENCES payables(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_payables_status ON payables(status);
CREATE INDEX IF NOT EXISTS idx_payables_supplier ON payables(supplier_id);
"#;

const MIGRATION_004_AUDIT: &str = r#"
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    machine_name TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_at);
"#;

const MIGRATION_005_CLOSURES: &str = r#"
CREATE TABLE IF NOT EXISTS period_closures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Abierto',
    closed_by INTEGER,
    closed_at TEXT,
    observations TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (closed_by) REFERENCES users(id),
    UNIQUE(month, year)
);
"#;

const MIGRATION_006_NUMBERING: &str = r#"
CREATE TABLE IF NOT EXISTS numbering_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    length INTEGER NOT NULL DEFAULT 6,
    current_number INTEGER NOT NULL DEFAULT 1,
    padding_char TEXT NOT NULL DEFAULT '0',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT OR IGNORE INTO numbering_sequences (module, prefix, current_number) VALUES
  ('ventas', 'FV-', 1),
  ('cotizaciones', 'COT-', 1),
  ('compras', 'COM-', 1),
  ('recibos', 'RC-', 1),
  ('egresos', 'EG-', 1);
"#;

/// Migración 007 (v2.1): Timestamps universales + Soft Delete + Multi-tenancy
/// Se ejecuta mediante ALTERs seguros que ignoran columnas duplicadas.
const MIGRATION_007_AUDIT_SCHEMA: &str = r#"
-- ============================================================
-- MIGRACIÓN 007: Auditoría, Soft Delete y Multi-tenancy
-- ============================================================

-- 1. Tabla de empresas (preparación multi-tenancy)
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nit TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    deleted_at TEXT
);
INSERT OR IGNORE INTO companies (id, name, nit) VALUES (1, 'Empresa Principal', '000000000-0');

-- 2. Índices de rendimiento para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(active);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date ON inventory_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_receivables_customer ON receivables(customer_id);
CREATE INDEX IF NOT EXISTS idx_receivables_status ON receivables(status);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON payroll_entries(period);
CREATE INDEX IF NOT EXISTS idx_physical_counts_status ON physical_counts(status);
"#;

