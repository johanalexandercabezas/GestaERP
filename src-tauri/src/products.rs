use rusqlite::{Connection, Result};
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct Product {
    pub id: i64,
    pub sku: String,
    pub name: String,
    pub description: Option<String>,
    pub price: f64,
    pub cost: f64,
    pub stock: f64,
    pub min_stock: f64,
    pub max_stock: f64,
    pub iva_percent: f64,
    pub active: bool,
    pub unit: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct DuplicateSuggestion {
    pub name: String,
    pub sku: String,
    pub similarity: f64,
}

#[derive(Serialize, Debug, Clone)]
pub struct ProductPage {
    pub rows: Vec<Product>,
    pub total: i64,
}

fn is_sku_duplicate_error(e: &rusqlite::Error) -> bool {
    if let rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error {
            code: rusqlite::ffi::ErrorCode::ConstraintViolation,
            ..
        },
        Some(ref msg),
    ) = e
    {
        msg.contains("UNIQUE constraint failed: products.sku")
    } else {
        false
    }
}

pub fn create_product(conn: &Connection, p: &Product) -> Result<i64> {
    let res = conn.execute(
        "INSERT INTO products (sku, name, description, price, cost, stock, min_stock, max_stock, iva_percent, active, unit) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![p.sku, p.name, p.description, p.price, p.cost, p.stock, p.min_stock, p.max_stock, p.iva_percent, p.active as i64, p.unit],
    );
    match res {
        Ok(_) => Ok(conn.last_insert_rowid()),
        Err(e) if is_sku_duplicate_error(&e) => Err(rusqlite::Error::InvalidParameterName(
            "El SKU ya existe. Por favor elige otro.".to_string(),
        )),
        Err(e) => Err(e),
    }
}

pub fn list_products(conn: &Connection, include_inactive: bool) -> Result<Vec<Product>> {
    let query = if include_inactive {
        "SELECT id, sku, name, description, price, cost, stock, min_stock, max_stock, iva_percent, active, COALESCE(unit, 'UNIDAD') FROM products ORDER BY name"
    } else {
        "SELECT id, sku, name, description, price, cost, stock, min_stock, max_stock, iva_percent, active, COALESCE(unit, 'UNIDAD') FROM products WHERE active = 1 ORDER BY name"
    };
    let mut stmt = conn.prepare(query)?;
    let rows = stmt.query_map([], |row| {
        Ok(Product {
            id: row.get(0)?,
            sku: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            price: row.get(4)?,
            cost: row.get(5)?,
            stock: row.get(6)?,
            min_stock: row.get(7)?,
            max_stock: row.get(8)?,
            iva_percent: row.get(9)?,
            active: row.get::<_, i64>(10)? != 0,
            unit: row.get(11)?,
        })
    })?;
    rows.collect()
}

pub fn list_products_page(
    conn: &Connection,
    search: &str,
    page: u32,
    page_size: u32,
) -> Result<ProductPage> {
    let page = page.max(1);
    let page_size = page_size.clamp(1, 100);
    let offset = i64::from(page.saturating_sub(1)) * i64::from(page_size);

    let total = conn.query_row(
        "SELECT COUNT(*) FROM products
         WHERE COALESCE(unit, 'UNIDAD') <> 'SERVICIO'
           AND (?1 = '' OR instr(lower(name), lower(?1)) > 0 OR instr(lower(sku), lower(?1)) > 0)",
        [search],
        |row| row.get(0),
    )?;

    let mut stmt = conn.prepare_cached(
        "SELECT id, sku, name, description, price, cost, stock, min_stock, max_stock,
                iva_percent, active, COALESCE(unit, 'UNIDAD')
         FROM products
         WHERE COALESCE(unit, 'UNIDAD') <> 'SERVICIO'
           AND (?1 = '' OR instr(lower(name), lower(?1)) > 0 OR instr(lower(sku), lower(?1)) > 0)
         ORDER BY name COLLATE NOCASE, id
         LIMIT ?2 OFFSET ?3",
    )?;
    let rows = stmt.query_map(
        rusqlite::params![search, i64::from(page_size), offset],
        |row| {
            Ok(Product {
                id: row.get(0)?,
                sku: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                price: row.get(4)?,
                cost: row.get(5)?,
                stock: row.get(6)?,
                min_stock: row.get(7)?,
                max_stock: row.get(8)?,
                iva_percent: row.get(9)?,
                active: row.get::<_, i64>(10)? != 0,
                unit: row.get(11)?,
            })
        },
    )?;

    Ok(ProductPage {
        rows: rows.collect::<Result<Vec<_>>>()?,
        total,
    })
}

pub fn update_product(conn: &Connection, p: &Product) -> Result<()> {
    let res = conn.execute(
        "UPDATE products SET sku=?1, name=?2, description=?3, price=?4, cost=?5, stock=?6, min_stock=?7, max_stock=?8, iva_percent=?9, active=?10, unit=?11 WHERE id=?12",
        rusqlite::params![p.sku, p.name, p.description, p.price, p.cost, p.stock, p.min_stock, p.max_stock, p.iva_percent, p.active as i64, p.unit, p.id],
    );
    match res {
        Ok(_) => Ok(()),
        Err(e) if is_sku_duplicate_error(&e) => Err(rusqlite::Error::InvalidParameterName(
            "El SKU ya existe. Por favor elige otro.".to_string(),
        )),
        Err(e) => Err(e),
    }
}

pub fn delete_product(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM products WHERE id=?1", [id])?;
    Ok(())
}

pub fn search_products(conn: &Connection, query: &str) -> Result<Vec<Product>> {
    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, sku, name, description, price, cost, stock, min_stock, max_stock, iva_percent, active, COALESCE(unit, 'UNIDAD') 
         FROM products 
         WHERE active = 1 AND (name LIKE ?1 OR sku LIKE ?1) AND COALESCE(unit, 'UNIDAD') != 'SERVICIO'
         ORDER BY name LIMIT 30",
    )?;
    let rows = stmt.query_map([&pattern], |row| {
        Ok(Product {
            id: row.get(0)?,
            sku: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            price: row.get(4)?,
            cost: row.get(5)?,
            stock: row.get(6)?,
            min_stock: row.get(7)?,
            max_stock: row.get(8)?,
            iva_percent: row.get(9)?,
            active: row.get::<_, i64>(10)? != 0,
            unit: row.get(11)?,
        })
    })?;
    rows.collect()
}

fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let len_a = a_chars.len();
    let len_b = b_chars.len();
    let mut matrix = vec![vec![0usize; len_b + 1]; len_a + 1];
    for i in 0..=len_a {
        matrix[i][0] = i;
    }
    for j in 0..=len_b {
        matrix[0][j] = j;
    }
    for i in 1..=len_a {
        for j in 1..=len_b {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            matrix[i][j] = (matrix[i - 1][j] + 1)
                .min(matrix[i][j - 1] + 1)
                .min(matrix[i - 1][j - 1] + cost);
        }
    }
    matrix[len_a][len_b]
}

pub fn find_similar_products(
    conn: &Connection,
    name: &str,
    _threshold: usize,
) -> Result<Vec<DuplicateSuggestion>> {
    let all = list_products(conn, false)?;
    let mut suggestions = Vec::new();
    for p in &all {
        if p.name.to_lowercase() == name.to_lowercase() {
            continue;
        }
        let dist = levenshtein_distance(&p.name.to_lowercase(), &name.to_lowercase());
        let max_len = p.name.len().max(name.len());
        let similarity = if max_len > 0 {
            1.0 - (dist as f64 / max_len as f64)
        } else {
            1.0
        };
        if similarity > 0.6 {
            suggestions.push(DuplicateSuggestion {
                name: p.name.clone(),
                sku: p.sku.clone(),
                similarity,
            });
        }
    }
    Ok(suggestions)
}

#[allow(dead_code)]
pub fn calcular_iva(base: f64, iva_percent: f64) -> f64 {
    let iva = base * iva_percent / 100.0;
    (iva * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_list_products_page_filters_search_and_pages() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE products (
                id INTEGER PRIMARY KEY, sku TEXT, name TEXT, description TEXT,
                price REAL, cost REAL, stock REAL, min_stock REAL, max_stock REAL,
                iva_percent REAL, active INTEGER, unit TEXT
            );
            INSERT INTO products VALUES
                (1, 'A-1', 'Arroz', NULL, 10, 5, 4, 1, 9, 0, 1, 'UNIDAD'),
                (2, 'B-1', 'Azúcar', NULL, 20, 8, 3, 1, 9, 0, 1, 'UNIDAD'),
                (3, 'S-1', 'Servicio', NULL, 30, 0, 0, 0, 0, 0, 1, 'SERVICIO'),
                (4, 'I-1', 'Inactivo', NULL, 40, 0, 0, 0, 0, 0, 0, 'UNIDAD');",
        )
        .unwrap();

        let first_page = list_products_page(&conn, "", 1, 1).unwrap();
        assert_eq!(first_page.total, 3);
        assert_eq!(first_page.rows.len(), 1);
        assert_eq!(first_page.rows[0].name, "Arroz");

        let search_result = list_products_page(&conn, "b-1", 1, 15).unwrap();
        assert_eq!(search_result.total, 1);
        assert_eq!(search_result.rows[0].name, "Azúcar");

        let inactive = list_products_page(&conn, "inactivo", 1, 15).unwrap();
        assert_eq!(inactive.total, 1);
        assert!(!inactive.rows[0].active);
    }

    #[test]
    fn test_iva_19_porciento() {
        assert_eq!(calcular_iva(100_000.0, 19.0), 19_000.0);
    }
    #[test]
    fn test_iva_5_porciento() {
        assert_eq!(calcular_iva(200_000.0, 5.0), 10_000.0);
    }
    #[test]
    fn test_iva_0_porciento() {
        assert_eq!(calcular_iva(123_456.0, 0.0), 0.0);
    }
    #[test]
    fn test_iva_redondeo_dos_decimales() {
        assert_eq!(calcular_iva(33_333.0, 19.0), 6333.27);
    }
}
