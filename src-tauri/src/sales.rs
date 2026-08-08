use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SaleItemRequest {
    pub product_id: i64,
    pub quantity: f64,
}

#[derive(Serialize, Debug, Clone)]
pub struct Sale {
    pub id: i64,
    pub user_id: i64,
    pub total: f64,
    pub payment_method: String,
    pub created_at: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct SaleItem {
    pub id: i64,
    pub sale_id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub total_price: f64,
}

#[derive(Serialize, Debug, Clone)]
pub struct SaleWithItems {
    pub sale: Sale,
    pub items: Vec<SaleItem>,
}

// TransactionGuard se reutiliza desde crate::transaction (DRY).
pub use crate::transaction::TransactionGuard;

/// Crea una venta simple (sin manejo automático de crédito/caja).
#[allow(dead_code)]
pub fn create_sale(
    conn: &Connection,
    user_id: i64,
    payment_method: &str,
    items: &[SaleItemRequest],
) -> Result<i64> {
    create_sale_core(conn, user_id, payment_method, items, None, None, false, 0.0)
}

/// Crea una venta completa con manejo de crédito y caja dentro de la misma transacción.
#[allow(dead_code)]
pub fn create_sale_complete(
    conn: &Connection,
    user_id: i64,
    payment_method: &str,
    items: &[SaleItemRequest],
    customer_id: Option<i64>,
    customer_name: Option<&str>,
    discount_percent: f64,
) -> Result<i64> {
    #[allow(dead_code)]
    let is_credit = payment_method == "Crédito";
    create_sale_core(
        conn,
        user_id,
        payment_method,
        items,
        customer_id,
        customer_name,
        is_credit,
        discount_percent,
    )
}

fn create_sale_core(
    conn: &Connection,
    user_id: i64,
    payment_method: &str,
    items: &[SaleItemRequest],
    customer_id: Option<i64>,
    customer_name: Option<&str>,
    is_credit: bool,
    discount_percent: f64,
) -> Result<i64> {
    if items.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName(
            "Debe incluir al menos un producto".to_string(),
        ));
    }

    for item in items {
        if item.quantity <= 0.0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "La cantidad a vender debe ser mayor a cero. Producto ID: {}",
                item.product_id
            )));
        }
    }

    // Iniciar transacción segura
    let tx = TransactionGuard::begin(conn).map_err(|e| rusqlite::Error::InvalidParameterName(e))?;

    let mut subtotal = 0.0;
    let mut item_details = Vec::new();
    for item in items {
        let (name, price, current_stock, min_stock, unit): (String, f64, f64, f64, String) = conn
            .query_row(
            "SELECT name, price, stock, min_stock, unit FROM products WHERE id = ?1 AND active = 1",
            [item.product_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get::<_, String>(4)
                        .unwrap_or_else(|_| "UNIDAD".to_string()),
                ))
            },
        )?;

        let is_service = unit == "SERVICIO";

        // Solo validar stock si NO es servicio
        if !is_service {
            if current_stock < item.quantity {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Stock insuficiente para '{}'. Disponible: {}",
                    name, current_stock
                )));
            }

            let new_stock = current_stock - item.quantity;
            if new_stock < min_stock {
                return Err(rusqlite::Error::InvalidParameterName(
                    format!(
                        "No se puede vender {} unidades de '{}'. Stock mínimo requerido: {}. Stock actual: {}",
                        item.quantity, name, min_stock, current_stock
                    ),
                ));
            }
        }

        let line_total = price * item.quantity;
        subtotal += line_total;
        item_details.push((item.product_id, item.quantity, price, line_total, name));
    }

    // Aplicar descuento
    let discount = if discount_percent > 0.0 && discount_percent <= 100.0 {
        subtotal * (discount_percent / 100.0)
    } else {
        0.0
    };
    let total = subtotal - discount;

    conn.execute(
        "INSERT INTO sales (user_id, total, payment_method) VALUES (?1, ?2, ?3)",
        rusqlite::params![user_id, total, payment_method],
    )?;
    let sale_id = conn.last_insert_rowid();

    for (product_id, quantity, price, subtotal, _name) in &item_details {
        conn.execute(
            "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![sale_id, product_id, quantity, price, subtotal],
        )?;

        // Verificar si es servicio consultando unit
        let unit: String = conn
            .query_row(
                "SELECT COALESCE(unit, 'UNIDAD') FROM products WHERE id = ?1",
                [product_id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "UNIDAD".to_string());
        let is_service = unit == "SERVICIO";

        // Solo descontar stock si NO es servicio
        if !is_service {
            conn.execute(
                "UPDATE products SET stock = stock - ?1 WHERE id = ?2",
                rusqlite::params![quantity, product_id],
            )?;

            conn.execute(
                "INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_price, reason) VALUES (?1, 'salida', ?2, ?3, ?4)",
                rusqlite::params![product_id, quantity, price, format!("Venta #{}", sale_id)],
            )?;
        } else {
            // Registrar movimiento de servicio
            conn.execute(
                "INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_price, reason) VALUES (?1, 'servicio', ?2, ?3, ?4)",
                rusqlite::params![product_id, 0.0, price, format!("Venta servicio #{}", sale_id)],
            )?;
        }
    }

    // Registrar descuento si aplica
    if discount > 0.0 {
        conn.execute(
            "INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_price, reason) VALUES (0, 'descuento', ?1, ?2, ?3)",
            rusqlite::params![1.0, discount, format!("Descuento {}% en Venta #{}", discount_percent, sale_id)],
        )?;
    }

    if is_credit {
        if let (Some(cid), Some(cname)) = (customer_id, customer_name) {
            conn.execute(
                "INSERT INTO receivables (customer_id, customer_name, sale_id, total, paid, status) VALUES (?1, ?2, ?3, ?4, 0, 'pending')",
                rusqlite::params![cid, cname, sale_id, total],
            )?;
        } else {
            return Err(rusqlite::Error::InvalidParameterName(
                "Faltan datos del cliente para la venta a crédito".to_string(),
            )); // ROLLBACK automático
        }
    } else {
        crate::cash_register::increment_balance_in_transaction(conn, total)?;
    }

    // Confirmar transacción manualmente
    tx.commit()
        .map_err(|e| rusqlite::Error::InvalidParameterName(e))?;

    Ok(sale_id)
}

/// Obtiene las ventas recientes (últimas 50) con sus items.
/// P1-06 FIX: Elimina el patrón N+1 (antes 1 query por venta + 1 por items = 51 queries).
/// Ahora usa una sola query con JOIN y agrupación.
pub fn get_recent_sales(conn: &Connection) -> Result<Vec<SaleWithItems>> {
    // Una sola query: trae las 50 ventas más recientes con sus items en un solo paso.
    let mut stmt = conn.prepare(
        "SELECT s.id, s.user_id, s.total, s.payment_method, s.created_at,
                si.id, si.sale_id, si.product_id, COALESCE(p.name, 'Producto eliminado'),
                si.quantity, si.unit_price, si.total_price
         FROM sales s
         LEFT JOIN sale_items si ON si.sale_id = s.id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE s.id IN (SELECT id FROM sales ORDER BY id DESC LIMIT 50)
         ORDER BY s.id DESC, si.id ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        let sale = Sale {
            id: row.get(0)?,
            user_id: row.get(1)?,
            total: row.get(2)?,
            payment_method: row.get(3)?,
            created_at: row.get(4)?,
        };
        // Si no hay item (LEFT JOIN sin match), sale_item_id es NULL → item = None
        let item_id: Option<i64> = row.get(5)?;
        let item = if item_id.is_some() {
            Some(SaleItem {
                id: item_id.unwrap(),
                sale_id: row.get(6)?,
                product_id: row.get(7)?,
                product_name: row.get(8)?,
                quantity: row.get(9)?,
                unit_price: row.get(10)?,
                total_price: row.get(11)?,
            })
        } else {
            None
        };
        Ok((sale, item))
    })?;

    // Agrupar items por venta
    let mut result: Vec<SaleWithItems> = Vec::new();
    let mut current: Option<SaleWithItems> = None;
    for row in rows {
        let (sale, item) = row?;
        match &mut current {
            Some(sw) if sw.sale.id == sale.id => {
                if let Some(it) = item {
                    sw.items.push(it);
                }
            }
            _ => {
                if let Some(prev) = current.take() {
                    result.push(prev);
                }
                current = Some(SaleWithItems {
                    sale,
                    items: item.into_iter().collect(),
                });
            }
        }
    }
    if let Some(prev) = current.take() {
        result.push(prev);
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        // CORRECCIÓN: Crear el esquema completo e insertar una caja abierta para permitir ventas en Efectivo
        conn.execute_batch("
            CREATE TABLE users (id INTEGER PRIMARY KEY);
            INSERT INTO users (id) VALUES (1);
            CREATE TABLE products (id INTEGER PRIMARY KEY, sku TEXT, name TEXT, description TEXT, price REAL, cost REAL, stock REAL, min_stock REAL, max_stock REAL, iva_percent REAL, unit TEXT, active INTEGER);
            CREATE TABLE sales (id INTEGER PRIMARY KEY, user_id INTEGER, customer_id INTEGER, total REAL, payment_method TEXT, created_at TEXT);
            CREATE TABLE sale_items (id INTEGER PRIMARY KEY, sale_id INTEGER, product_id INTEGER, quantity REAL, unit_price REAL, total_price REAL);
            CREATE TABLE inventory_movements (id INTEGER PRIMARY KEY, product_id INTEGER, movement_type TEXT, quantity REAL, unit_price REAL, reason TEXT, created_at TEXT);
            CREATE TABLE cash_registers (id INTEGER PRIMARY KEY, user_id INTEGER, open_date TEXT, close_date TEXT, initial_balance REAL, current_balance REAL, final_balance REAL, status TEXT NOT NULL DEFAULT 'open');
            CREATE TABLE receivables (id INTEGER PRIMARY KEY, customer_id INTEGER, customer_name TEXT, sale_id INTEGER, total REAL, paid REAL, status TEXT, created_at TEXT);
            
            INSERT INTO cash_registers (id, user_id, initial_balance, current_balance, status) VALUES (1, 1, 0.0, 0.0, 'open');
        ").unwrap();
        conn
    }

    #[test]
    fn test_create_sale_updates_stock() {
        let conn = setup_db();

        // Insertar producto de prueba (stock 10, mínimo 1)
        conn.execute("INSERT INTO products (sku, name, price, cost, stock, min_stock, max_stock, iva_percent, active) VALUES ('TEST1', 'Prod Test', 100.0, 50.0, 10.0, 1.0, 20.0, 0, 1)", []).unwrap();

        let items = vec![SaleItemRequest {
            product_id: 1,
            quantity: 2.0,
        }];

        // Crear venta
        let sale_id = create_sale(&conn, 1, "Efectivo", &items).unwrap();
        assert_eq!(sale_id, 1);

        // Verificar que el stock bajó a 8
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(stock, 8.0);

        // Verificar que la caja incrementó su saldo (100 * 2 = 200)
        let balance: f64 = conn
            .query_row(
                "SELECT current_balance FROM cash_registers WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(balance, 200.0);
    }

    #[test]
    fn test_cannot_sell_below_min_stock() {
        let conn = setup_db();

        // Insertar producto (stock 2, mínimo 2) - No debería permitir vender 1
        conn.execute("INSERT INTO products (sku, name, price, cost, stock, min_stock, max_stock, iva_percent, active) VALUES ('TEST2', 'Prod Min', 100.0, 50.0, 2.0, 2.0, 20.0, 0, 1)", []).unwrap();

        let items = vec![SaleItemRequest {
            product_id: 1,
            quantity: 1.0,
        }];

        // Intentar crear venta - Debe dar error
        let result = create_sale(&conn, 1, "Efectivo", &items);
        assert!(
            result.is_err(),
            "No debería permitir vender por debajo del stock mínimo"
        );
    }

    #[test]
    fn test_cannot_sell_zero_or_negative_quantity() {
        let conn = setup_db();
        conn.execute("INSERT INTO products (sku, name, price, cost, stock, min_stock, max_stock, iva_percent, active) VALUES ('TEST3', 'Prod Zero', 100.0, 50.0, 10.0, 0.0, 20.0, 0, 1)", []).unwrap();

        let items_zero = vec![SaleItemRequest {
            product_id: 1,
            quantity: 0.0,
        }];
        let result_zero = create_sale(&conn, 1, "Efectivo", &items_zero);
        assert!(result_zero.is_err());

        let items_neg = vec![SaleItemRequest {
            product_id: 1,
            quantity: -2.0,
        }];
        let result_neg = create_sale(&conn, 1, "Efectivo", &items_neg);
        assert!(result_neg.is_err());
    }
}
