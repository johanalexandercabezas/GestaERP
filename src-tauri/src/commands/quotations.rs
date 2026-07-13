use tauri::State;
use crate::AppState;
use crate::auth_guard;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct QuotationItemInput {
    pub product_id: Option<i64>,
    pub product_name: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub iva_percent: f64,
    pub discount_percent: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QuotationRow {
    pub id: i64,
    pub consecutive: String,
    pub date: String,
    pub due_date: Option<String>,
    pub customer_id: i64,
    pub customer_name: String,
    pub customer_doc: Option<String>,
    pub items: String,
    pub subtotal: f64,
    pub iva_percent: f64,
    pub iva_amount: f64,
    pub discount_percent: f64,
    pub discount_amount: f64,
    pub total: f64,
    pub observations: Option<String>,
    pub status: String,
    pub created_by: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Genera el siguiente consecutivo para cotizaciones
fn get_next_consecutive(conn: &rusqlite::Connection) -> Result<String, String> {
    let prefix = "COT-";
    let length = 6;

    let last: Option<String> = conn.query_row(
        "SELECT consecutive FROM quotations ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0),
    ).ok();

    let next_number = match last {
        Some(consecutive) => {
            let num_str = consecutive.trim_start_matches(prefix);
            let num: i64 = num_str.parse().unwrap_or(0);
            num + 1
        }
        None => 1,
    };

    let padded = format!("{:0>width$}", next_number, width = length);
    Ok(format!("{}{}", prefix, padded))
}

#[tauri::command]
pub fn create_quotation(
    state: State<AppState>,
    date: String,
    due_date: Option<String>,
    customer_id: i64,
    customer_name: String,
    customer_doc: Option<String>,
    items: Vec<QuotationItemInput>,
    subtotal: f64,
    iva_percent: f64,
    iva_amount: f64,
    discount_percent: f64,
    discount_amount: f64,
    total: f64,
    observations: Option<String>,
    created_by: i64,
) -> Result<i64, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let consecutive = get_next_consecutive(&conn)?;
    let items_json = serde_json::to_string(&items).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO quotations (consecutive, date, due_date, customer_id, customer_name, customer_doc, items, subtotal, iva_percent, iva_amount, discount_percent, discount_amount, total, observations, status, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'Borrador', ?15)",
        rusqlite::params![
            consecutive, date, due_date, customer_id, customer_name, customer_doc,
            items_json, subtotal, iva_percent, iva_amount, discount_percent, discount_amount,
            total, observations, created_by
        ],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    // Insertar items
    for item in items {
        let item_subtotal = item.quantity * item.unit_price * (1.0 - item.discount_percent / 100.0);
        conn.execute(
            "INSERT INTO quotation_items (quotation_id, product_id, product_name, description, quantity, unit_price, iva_percent, discount_percent, subtotal)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                id, item.product_id, item.product_name, item.description,
                item.quantity, item.unit_price, item.iva_percent, item.discount_percent, item_subtotal
            ],
        ).map_err(|e| e.to_string())?;
    }

    Ok(id)
}

#[tauri::command]
pub fn list_quotations(
    state: State<AppState>,
    status_filter: Option<String>,
) -> Result<Vec<QuotationRow>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let query = if status_filter.is_some() {
        "SELECT id, consecutive, date, due_date, customer_id, customer_name, customer_doc, items, subtotal, iva_percent, iva_amount, discount_percent, discount_amount, total, observations, status, created_by, created_at, updated_at FROM quotations WHERE status = ?1 ORDER BY date DESC"
    } else {
        "SELECT id, consecutive, date, due_date, customer_id, customer_name, customer_doc, items, subtotal, iva_percent, iva_amount, discount_percent, discount_amount, total, observations, status, created_by, created_at, updated_at FROM quotations ORDER BY date DESC"
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let params = status_filter.map(|s| [s]).unwrap_or_default();

    let rows = stmt.query_map(params, |row| {
        Ok(QuotationRow {
            id: row.get(0)?,
            consecutive: row.get(1)?,
            date: row.get(2)?,
            due_date: row.get(3)?,
            customer_id: row.get(4)?,
            customer_name: row.get(5)?,
            customer_doc: row.get(6)?,
            items: row.get(7)?,
            subtotal: row.get(8)?,
            iva_percent: row.get(9)?,
            iva_amount: row.get(10)?,
            discount_percent: row.get(11)?,
            discount_amount: row.get(12)?,
            total: row.get(13)?,
            observations: row.get(14)?,
            status: row.get(15)?,
            created_by: row.get(16)?,
            created_at: row.get(17)?,
            updated_at: row.get(18)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_quotation(state: State<AppState>, id: i64) -> Result<QuotationRow, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, consecutive, date, due_date, customer_id, customer_name, customer_doc, items, subtotal, iva_percent, iva_amount, discount_percent, discount_amount, total, observations, status, created_by, created_at, updated_at FROM quotations WHERE id = ?1",
        [id],
        |row| {
            Ok(QuotationRow {
                id: row.get(0)?,
                consecutive: row.get(1)?,
                date: row.get(2)?,
                due_date: row.get(3)?,
                customer_id: row.get(4)?,
                customer_name: row.get(5)?,
                customer_doc: row.get(6)?,
                items: row.get(7)?,
                subtotal: row.get(8)?,
                iva_percent: row.get(9)?,
                iva_amount: row.get(10)?,
                discount_percent: row.get(11)?,
                discount_amount: row.get(12)?,
                total: row.get(13)?,
                observations: row.get(14)?,
                status: row.get(15)?,
                created_by: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
            })
        },
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_quotation_status(state: State<AppState>, id: i64, new_status: String) -> Result<(), String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE quotations SET status = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
        [new_status, id.to_string()],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_quotation(state: State<AppState>, id: i64) -> Result<(), String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM quotation_items WHERE quotation_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM quotations WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn convert_quotation_to_sale(
    state: State<AppState>,
    quotation_id: i64,
    payment_method: String,
) -> Result<i64, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let quotation: QuotationRow = conn.query_row(
        "SELECT * FROM quotations WHERE id = ?1",
        [quotation_id],
        |row| {
            Ok(QuotationRow {
                id: row.get(0)?,
                consecutive: row.get(1)?,
                date: row.get(2)?,
                due_date: row.get(3)?,
                customer_id: row.get(4)?,
                customer_name: row.get(5)?,
                customer_doc: row.get(6)?,
                items: row.get(7)?,
                subtotal: row.get(8)?,
                iva_percent: row.get(9)?,
                iva_amount: row.get(10)?,
                discount_percent: row.get(11)?,
                discount_amount: row.get(12)?,
                total: row.get(13)?,
                observations: row.get(14)?,
                status: row.get(15)?,
                created_by: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
            })
        },
    ).map_err(|e| e.to_string())?;

    if quotation.status != "Aprobada" {
        return Err("Solo se pueden convertir cotizaciones aprobadas".to_string());
    }

    // Crear venta
    conn.execute(
        "INSERT INTO sales (user_id, customer_id, total, payment_method) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![quotation.created_by, quotation.customer_id, quotation.total, payment_method],
    ).map_err(|e| e.to_string())?;

    let sale_id = conn.last_insert_rowid();

    // Insertar items de la cotización como items de venta
    let items: Vec<QuotationItemInput> = serde_json::from_str(&quotation.items).map_err(|e| e.to_string())?;
    for item in items {
        if let Some(product_id) = item.product_id {
            let item_total = item.quantity * item.unit_price;
            conn.execute(
                "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![sale_id, product_id, item.quantity, item.unit_price, item_total],
            ).map_err(|e| e.to_string())?;
        }
    }

    // Actualizar estado de cotización
    conn.execute(
        "UPDATE quotations SET status = 'Convertida', updated_at = datetime('now','localtime') WHERE id = ?1",
        [quotation_id],
    ).map_err(|e| e.to_string())?;

    Ok(sale_id)
}