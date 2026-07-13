use tauri::State;
use crate::AppState;
use crate::auth_guard;
use crate::utils::parse_f64;
use crate::products;
use crate::audit;
use rusqlite::Connection;

#[tauri::command]
pub fn create_product(state: State<AppState>, sku: String, name: String, description: Option<String>, price: String, cost: String, stock: String, min_stock: String, max_stock: String, iva_percent: String, unit: String) -> Result<i64, String> {
    let user = auth_guard::current_user(&state)?;
    let price = parse_f64(&price, "precio")?;
    let cost = parse_f64(&cost, "costo")?;
    let stock = parse_f64(&stock, "stock")?;
    let min_stock = parse_f64(&min_stock, "stock mín.")?;
    let max_stock = parse_f64(&max_stock, "stock máx.")?;
    let iva_percent = parse_f64(&iva_percent, "IVA %")?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let p = products::Product { id: 0, sku, name: name.clone(), description, price, cost, stock, min_stock, max_stock, iva_percent, active: true, unit };
    match products::create_product(&conn, &p) {
        Ok(id) => {
            audit::log_action(&conn, user.id, &user.full_name, "products", id, "CREATE", None, Some(&audit::to_json_string(&p)));
            Ok(id)
        }
        Err(e) => {
            if let rusqlite::Error::InvalidParameterName(msg) = &e { Err(msg.clone()) }
            else { Err(format!("Error: {}", e)) }
        }
    }
}

#[tauri::command]
pub fn list_products(state: State<AppState>) -> Result<Vec<products::Product>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    products::list_products(&conn, false).map_err(|e| format!("Error: {}", e))
}

#[tauri::command]
pub fn update_product(state: State<AppState>, id: i64, sku: String, name: String, description: Option<String>, price: String, cost: String, stock: String, min_stock: String, max_stock: String, iva_percent: String, active: bool, unit: String) -> Result<(), String> {
    let user = auth_guard::current_user(&state)?;
    let price = parse_f64(&price, "precio")?;
    let cost = parse_f64(&cost, "costo")?;
    let stock = parse_f64(&stock, "stock")?;
    let min_stock = parse_f64(&min_stock, "stock mín.")?;
    let max_stock = parse_f64(&max_stock, "stock máx.")?;
    let iva_percent = parse_f64(&iva_percent, "IVA %")?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let p = products::Product { id, sku, name, description, price, cost, stock, min_stock, max_stock, iva_percent, active, unit };
    match products::update_product(&conn, &p) {
        Ok(_) => {
            audit::log_action(&conn, user.id, &user.full_name, "products", id, "UPDATE", None, Some(&audit::to_json_string(&p)));
            Ok(())
        }
        Err(e) => {
            if let rusqlite::Error::InvalidParameterName(msg) = &e { Err(msg.clone()) }
            else { Err(format!("Error: {}", e)) }
        }
    }
}

#[tauri::command]
pub fn delete_product(state: State<AppState>, id: i64) -> Result<(), String> {
    let user = auth_guard::current_user(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    products::delete_product(&conn, id).map_err(|e| {
        format!("Error: {}", e)
    })?;
    audit::log_action(&conn, user.id, &user.full_name, "products", id, "DELETE", None, None);
    Ok(())
}

#[tauri::command]
pub fn search_products(state: State<AppState>, query: String) -> Result<Vec<products::Product>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    products::search_products(&conn, &query).map_err(|e| format!("Error: {}", e))
}

#[tauri::command]
pub fn check_duplicates(state: State<AppState>, name: String) -> Result<Vec<products::DuplicateSuggestion>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    products::find_similar_products(&conn, &name, 3).map_err(|e| format!("Error: {}", e))
}

#[tauri::command]
pub fn list_services(state: State<AppState>) -> Result<Vec<products::Product>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    services_list(&conn).map_err(|e| format!("Error: {}", e))
}

#[tauri::command]
pub fn list_active_services(state: State<AppState>) -> Result<Vec<products::Product>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    services_list_active(&conn).map_err(|e| format!("Error: {}", e))
}

#[tauri::command]
pub fn update_service(state: State<AppState>, id: i64, sku: String, name: String, description: Option<String>, price: String, iva_percent: String, active: bool) -> Result<(), String> {
    auth_guard::require_admin(&state)?;
    let price = parse_f64(&price, "precio")?;
    let iva_percent = parse_f64(&iva_percent, "IVA %")?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    services_update(&conn, id, sku, name, description, price, iva_percent, active).map_err(|e| format!("Error: {}", e))
}

#[tauri::command]
pub fn find_product_by_sku(state: State<AppState>, sku: String) -> Result<products::Product, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, sku, name, description, price, cost, stock, min_stock, max_stock, iva_percent, active, COALESCE(unit, 'UNIDAD') FROM products WHERE sku = ?1 AND active = 1").map_err(|e| e.to_string())?;
    stmt.query_row([&sku], |row| {
        Ok(products::Product {
            id: row.get(0)?, sku: row.get(1)?, name: row.get(2)?, description: row.get(3)?, price: row.get(4)?,
            cost: row.get(5)?, stock: row.get(6)?, min_stock: row.get(7)?, max_stock: row.get(8)?,
            iva_percent: row.get(9)?, active: row.get::<_, i64>(10)? != 0,
            unit: row.get(11)?,
        })
    })
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => "Producto no encontrado".to_string(),
        _ => format!("Error: {}", e),
    })
}

fn services_list(conn: &Connection) -> Result<Vec<products::Product>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, sku, name, description, price, cost, stock, min_stock, max_stock, iva_percent, active, COALESCE(unit, 'UNIDAD') FROM products WHERE unit = 'SERVICIO' ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(products::Product {
            id: row.get(0)?, sku: row.get(1)?, name: row.get(2)?, description: row.get(3)?,
            price: row.get(4)?, cost: row.get(5)?, stock: row.get(6)?, min_stock: row.get(7)?,
            max_stock: row.get(8)?, iva_percent: row.get(9)?, active: row.get::<_, i64>(10)? != 0,
            unit: row.get(11)?,
        })
    })?;
    rows.collect()
}

fn services_list_active(conn: &Connection) -> Result<Vec<products::Product>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, sku, name, description, price, cost, stock, min_stock, max_stock, iva_percent, active, COALESCE(unit, 'UNIDAD') FROM products WHERE unit = 'SERVICIO' AND active = 1 ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(products::Product {
            id: row.get(0)?, sku: row.get(1)?, name: row.get(2)?, description: row.get(3)?,
            price: row.get(4)?, cost: row.get(5)?, stock: row.get(6)?, min_stock: row.get(7)?,
            max_stock: row.get(8)?, iva_percent: row.get(9)?, active: row.get::<_, i64>(10)? != 0,
            unit: row.get(11)?,
        })
    })?;
    rows.collect()
}

fn services_update(conn: &Connection, id: i64, sku: String, name: String, description: Option<String>, price: f64, iva_percent: f64, active: bool) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE products SET sku=?1, name=?2, description=?3, price=?4, iva_percent=?5, active=?6 WHERE id=?7 AND unit='SERVICIO'",
        rusqlite::params![sku, name, description, price, iva_percent, active as i64, id],
    )?;
    Ok(())
}