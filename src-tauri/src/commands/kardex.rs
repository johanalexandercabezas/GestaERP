use tauri::State;
use crate::AppState;
use crate::auth_guard;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct InventoryMovementRow {
    pub id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub movement_type: String,
    pub quantity: f64,
    pub unit_price: Option<f64>,
    pub reason: Option<String>,
    pub created_at: String,
    pub user_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KardexItem {
    pub date: String,
    pub document: String,
    pub movement_type: String,
    pub user: String,
    pub entry: f64,
    pub output: f64,
    pub balance: f64,
    pub unit_price: Option<f64>,
    pub reason: Option<String>,
}

#[tauri::command]
pub fn get_inventory_movements(
    state: State<AppState>,
    product_id: Option<i64>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<InventoryMovementRow>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut conditions = Vec::new();
    let mut params = Vec::new();

    if let Some(pid) = product_id {
        conditions.push("product_id = ?".to_string());
        params.push(pid.to_string());
    }
    if let Some(ref sd) = start_date {
        conditions.push("date(created_at) >= ?".to_string());
        params.push(sd.clone());
    }
    if let Some(ref ed) = end_date {
        conditions.push("date(created_at) <= ?".to_string());
        params.push(ed.clone());
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let query = format!(
        "SELECT m.id, m.product_id, p.name as product_name, m.movement_type, m.quantity, m.unit_price, m.reason, m.created_at, m.user_id
         FROM inventory_movements m
         LEFT JOIN products p ON p.id = m.product_id
         {} ORDER BY m.created_at DESC",
        where_clause
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params), |row| {
        Ok(InventoryMovementRow {
            id: row.get(0)?,
            product_id: row.get(1)?,
            product_name: row.get(2)?,
            movement_type: row.get(3)?,
            quantity: row.get(4)?,
            unit_price: row.get(5)?,
            reason: row.get(6)?,
            created_at: row.get(7)?,
            user_id: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_product_kardex(
    state: State<AppState>,
    product_id: i64,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<KardexItem>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Obtener nombre del producto (validación de existencia)
    conn.query_row(
        "SELECT name FROM products WHERE id = ?1",
        [product_id],
        |row| row.get::<_, String>(0),
    ).map_err(|e| e.to_string())?;

    // Obtener saldo inicial (antes de start_date)
    // Clonamos para evitar mover start_date/end_date y poder usarlas después
    let sd_clone = start_date.clone();
    let initial_balance: f64 = if let (Some(sd_val), Some(_)) = (&start_date, &end_date) {
        conn.query_row(
            "SELECT COALESCE(SUM(CASE WHEN movement_type IN ('Compra', 'Ajuste', 'Devolución') THEN quantity ELSE -quantity END), 0)
             FROM inventory_movements
             WHERE product_id = ?1 AND date(created_at) < ?2",
            [product_id.to_string(), sd_val.clone()],
            |row| row.get(0),
        ).unwrap_or(0.0)
    } else if let Some(sd_val) = sd_clone {
        conn.query_row(
            "SELECT COALESCE(SUM(CASE WHEN movement_type IN ('Compra', 'Ajuste', 'Devolución') THEN quantity ELSE -quantity END), 0)
             FROM inventory_movements
             WHERE product_id = ?1 AND date(created_at) < ?2",
            [product_id.to_string(), sd_val],
            |row| row.get(0),
        ).unwrap_or(0.0)
    } else {
        0.0
    };

    // Obtener movimientos del período
    let mut conditions = vec!["m.product_id = ?".to_string()];
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(product_id)];

    if let Some(ref sd) = start_date {
        conditions.push("date(m.created_at) >= ?".to_string());
        params.push(Box::new(sd.clone()));
    }
    if let Some(ref ed) = end_date {
        conditions.push("date(m.created_at) <= ?".to_string());
        params.push(Box::new(ed.clone()));
    }

    let where_clause = format!("WHERE {}", conditions.join(" AND "));

    let query = format!(
        "SELECT m.created_at, m.movement_type, m.quantity, m.unit_price, m.reason, COALESCE(u.username, 'Sistema') as username
         FROM inventory_movements m
         LEFT JOIN users u ON u.id = m.user_id
         {} ORDER BY m.created_at ASC",
        where_clause
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, Option<f64>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, String>(5)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut kardex: Vec<KardexItem> = Vec::new();
    let mut running_balance = initial_balance;

    // Agregar línea de saldo inicial si hay fecha inicio
    if let Some(ref sd) = start_date {
        kardex.push(KardexItem {
            date: sd.clone(),
            document: "SALDO INICIAL".to_string(),
            movement_type: "Saldo Inicial".to_string(),
            user: "Sistema".to_string(),
            entry: initial_balance,
            output: 0.0,
            balance: initial_balance,
            unit_price: None,
            reason: None,
        });
    }

    for row in rows {
        let (date, mov_type, qty, unit_price, reason, user) = row.map_err(|e| e.to_string())?;
        let is_entry = matches!(mov_type.as_str(), "Compra" | "Ajuste" | "Devolución");
        let entry = if is_entry { qty } else { 0.0 };
        let output = if is_entry { 0.0 } else { qty };
        running_balance += entry - output;

        kardex.push(KardexItem {
            date,
            document: format!("Movimiento #{}", mov_type),
            movement_type: mov_type,
            user,
            entry,
            output,
            balance: running_balance,
            unit_price,
            reason,
        });
    }

    Ok(kardex)
}

#[tauri::command]
pub fn export_kardex_csv(
    state: State<AppState>,
    product_id: Option<i64>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<(String, String), String> {
    let data = get_inventory_movements(state, product_id, start_date.clone(), end_date.clone())?;

    let mut csv = String::from("Fecha,Producto,Tipo,Cantidad,Precio Unitario,Motivo\n");
    for row in &data {
        csv.push_str(&format!(
            "{},{},{},{},{},{}\n",
            row.created_at,
            row.product_name,
            row.movement_type,
            row.quantity,
            row.unit_price.unwrap_or(0.0),
            row.reason.clone().unwrap_or_default()
        ));
    }

    let filename = format!("kardex_{}.csv", chrono::Local::now().format("%Y%m%d_%H%M%S"));
    Ok((csv, filename))
}