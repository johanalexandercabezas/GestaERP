use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PurchaseItemRequest {
    pub product_id: Option<i64>,
    pub product_name: String,
    pub description: String,
    pub quantity: f64,
    pub unit_cost: f64,
    pub iva_percent: f64,
    pub unit: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct Purchase {
    pub id: i64,
    pub user_id: i64,
    pub supplier_id: Option<i64>,
    pub supplier_name: String,
    pub invoice_number: String,
    pub total: f64,
    pub created_at: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct PurchaseItem {
    pub id: i64,
    pub purchase_id: i64,
    pub product_id: Option<i64>,
    pub product_name: String,
    pub description: String,
    pub quantity: f64,
    pub unit_cost: f64,
    pub total_cost: f64,
    pub iva_percent: f64,
    pub unit: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct PurchaseWithItems {
    pub purchase: Purchase,
    pub items: Vec<PurchaseItem>,
}

/// Crea una compra con transacción nativa segura.
pub fn create_purchase(
    conn: &Connection,
    user_id: i64,
    supplier_id: Option<i64>,
    supplier_name: &str,
    invoice_number: &str,
    items: &[PurchaseItemRequest],
) -> Result<i64> {
    if items.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName(
            "Debe incluir al menos un producto".to_string(),
        ));
    }

    for item in items {
        if item.quantity <= 0.0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "La cantidad a comprar debe ser mayor a cero para '{}'",
                item.product_name
            )));
        }
        if item.unit_cost < 0.0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "El costo unitario no puede ser negativo para '{}'",
                item.product_name
            )));
        }
        // Las compras solo ingresan PRODUCTOS (UNIDAD). Los SERVICIOS no se compran.
        let unit = item.unit.to_uppercase();
        if unit != "UNIDAD" {
            return Err(rusqlite::Error::InvalidParameterName(
                format!("Solo se pueden comprar productos tipo UNIDAD. '{}' está registrado como '{}' y debe administrarse como servicio.", item.product_name, item.unit),
            ));
        }
    }

    // CORRECCIÓN DE AUDITORÍA: Transacción nativa. Rollback automático si hay error.
    let tx = conn.unchecked_transaction()?;

    let mut total = 0.0;
    let mut item_details = Vec::new();

    for item in items {
        let product_id = if let Some(pid) = item.product_id {
            pid
        } else {
            let sku = generate_sku(&item.product_name);
            tx.execute(
                "INSERT INTO products (sku, name, description, price, cost, stock, min_stock, max_stock, iva_percent, unit) VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, ?6, ?7)",
                rusqlite::params![sku, item.product_name, item.description, 0.0, item.unit_cost, item.iva_percent, item.unit],
            )?;
            tx.last_insert_rowid()
        };

        let total_cost = item.unit_cost * item.quantity;
        total += total_cost;
        item_details.push((product_id, item));
    }

    tx.execute(
        "INSERT INTO purchases (user_id, supplier_id, supplier_name, invoice_number, total) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![user_id, supplier_id, supplier_name, invoice_number, total],
    )?;
    let purchase_id = tx.last_insert_rowid();

    for (product_id, item) in &item_details {
        tx.execute(
            "INSERT INTO purchase_items (purchase_id, product_id, product_name, description, quantity, unit_cost, total_cost, iva_percent, unit) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![purchase_id, product_id, item.product_name, item.description, item.quantity, item.unit_cost, item.unit_cost * item.quantity, item.iva_percent, item.unit],
        )?;

        tx.execute(
            "UPDATE products SET stock = stock + ?1 WHERE id = ?2",
            rusqlite::params![item.quantity, product_id],
        )?;

        tx.execute(
            "INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_price, reason) VALUES (?1, 'entrada', ?2, ?3, ?4)",
            rusqlite::params![product_id, item.quantity, item.unit_cost, format!("Compra #{}", purchase_id)],
        )?;
    }

    tx.commit()?; // Confirmar explícitamente
    Ok(purchase_id)
}

fn generate_sku(name: &str) -> String {
    let prefix: String = name.chars().filter(|c| c.is_alphabetic()).take(3).collect();
    let timestamp = chrono::Utc::now().format("%m%d%H%M").to_string();
    format!("{}{}", prefix.to_uppercase(), timestamp)
}

/// Obtiene las compras recientes (últimas 50) con sus items.
pub fn get_recent_purchases(conn: &Connection) -> Result<Vec<PurchaseWithItems>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, supplier_id, supplier_name, invoice_number, total, created_at FROM purchases ORDER BY id DESC LIMIT 50",
    )?;
    let purchases = stmt.query_map([], |row| {
        Ok(Purchase {
            id: row.get(0)?,
            user_id: row.get(1)?,
            supplier_id: row.get(2)?,
            supplier_name: row.get(3)?,
            invoice_number: row.get(4)?,
            total: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;

    let mut result = Vec::new();
    for purchase in purchases {
        let purchase = purchase?;
        let mut item_stmt = conn.prepare(
            "SELECT pi.id, pi.purchase_id, pi.product_id, pi.product_name, pi.description, pi.quantity, pi.unit_cost, pi.total_cost, pi.iva_percent, pi.unit FROM purchase_items pi WHERE pi.purchase_id = ?1",
        )?;
        let items = item_stmt.query_map([purchase.id], |row| {
            Ok(PurchaseItem {
                id: row.get(0)?,
                purchase_id: row.get(1)?,
                product_id: row.get(2)?,
                product_name: row.get(3)?,
                description: row.get(4)?,
                quantity: row.get(5)?,
                unit_cost: row.get(6)?,
                total_cost: row.get(7)?,
                iva_percent: row.get(8)?,
                unit: row.get(9)?,
            })
        })?;
        let items: Result<Vec<PurchaseItem>> = items.collect();
        result.push(PurchaseWithItems {
            purchase,
            items: items?,
        });
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                sku TEXT UNIQUE,
                name TEXT,
                description TEXT,
                price REAL,
                cost REAL,
                stock REAL,
                min_stock REAL,
                max_stock REAL,
                iva_percent REAL,
                unit TEXT,
                active INTEGER
            );
            CREATE TABLE purchases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                supplier_id INTEGER,
                supplier_name TEXT,
                invoice_number TEXT,
                total REAL,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE purchase_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                purchase_id INTEGER,
                product_id INTEGER,
                product_name TEXT,
                description TEXT,
                quantity REAL,
                unit_cost REAL,
                total_cost REAL,
                iva_percent REAL,
                unit TEXT
            );
            CREATE TABLE inventory_movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                movement_type TEXT,
                quantity REAL,
                unit_price REAL,
                reason TEXT,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
        ",
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_create_purchase_valid() {
        let conn = setup_db();
        let items = vec![PurchaseItemRequest {
            product_id: None,
            product_name: "Tornillos".to_string(),
            description: "De 1 pulgada".to_string(),
            quantity: 100.0,
            unit_cost: 15.0,
            iva_percent: 19.0,
            unit: "UNIDAD".to_string(),
        }];

        let purchase_id = create_purchase(
            &conn,
            1,
            Some(1),
            "Ferretería El Tornillo",
            "FACT-123",
            &items,
        )
        .unwrap();
        assert_eq!(purchase_id, 1);

        // Verify inventory count increased
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(stock, 100.0);
    }

    #[test]
    fn test_create_purchase_invalid_inputs() {
        let conn = setup_db();

        // Zero quantity
        let items_zero = vec![PurchaseItemRequest {
            product_id: None,
            product_name: "Tornillos".to_string(),
            description: "De 1 pulgada".to_string(),
            quantity: 0.0,
            unit_cost: 15.0,
            iva_percent: 19.0,
            unit: "UNIDAD".to_string(),
        }];
        let res_zero = create_purchase(&conn, 1, Some(1), "Ferretería", "F-1", &items_zero);
        assert!(res_zero.is_err());

        // Negative unit cost
        let items_neg_cost = vec![PurchaseItemRequest {
            product_id: None,
            product_name: "Tornillos".to_string(),
            description: "De 1 pulgada".to_string(),
            quantity: 10.0,
            unit_cost: -5.0,
            iva_percent: 19.0,
            unit: "UNIDAD".to_string(),
        }];
        let res_neg_cost = create_purchase(&conn, 1, Some(1), "Ferretería", "F-2", &items_neg_cost);
        assert!(res_neg_cost.is_err());
    }
}
