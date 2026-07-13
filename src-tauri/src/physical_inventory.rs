use rusqlite::{Connection, Result};
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct PhysicalCount {
    pub id: i64,
    pub user_id: i64,
    pub status: String,
    pub notes: String,
    pub created_at: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct PhysicalCountItem {
    pub id: i64,
    pub count_id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub product_sku: String,
    pub theoretical_qty: f64,
    pub counted_qty: f64,
    pub difference: f64,
    pub adjusted: bool,
}

#[derive(Serialize, Debug, Clone)]
pub struct PhysicalCountWithItems {
    pub count: PhysicalCount,
    pub items: Vec<PhysicalCountItem>,
}

/// Crea un nuevo conteo de inventario y retorna el ID
pub fn create_physical_count(conn: &Connection, user_id: i64, notes: &str) -> Result<i64> {
    conn.execute(
        "INSERT INTO physical_counts (user_id, notes) VALUES (?1, ?2)",
        rusqlite::params![user_id, notes],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Agrega productos al conteo (todos los activos o seleccionados)
pub fn add_items_to_count(conn: &Connection, count_id: i64, product_ids: Option<Vec<i64>>) -> Result<()> {
    let products = if let Some(ids) = product_ids {
        // Solo productos específicos
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT id, name, sku, stock FROM products WHERE active = 1 AND id IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&query)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(ids.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
            ))
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        result
    } else {
        // Todos los productos activos
        let mut stmt = conn.prepare(
            "SELECT id, name, sku, stock FROM products WHERE active = 1 ORDER BY name",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
            ))
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        result
    };

    for (product_id, _name, _sku, stock) in &products {
        conn.execute(
            "INSERT INTO physical_count_items (count_id, product_id, theoretical_qty) VALUES (?1, ?2, ?3)",
            rusqlite::params![count_id, product_id, stock],
        )?;
    }
    Ok(())
}

/// Actualiza la cantidad contada de un ítem
pub fn update_counted_qty(conn: &Connection, item_id: i64, counted_qty: f64) -> Result<()> {
    let difference = {
        let theoretical: f64 = conn.query_row(
            "SELECT theoretical_qty FROM physical_count_items WHERE id = ?1",
            [item_id],
            |row| row.get(0),
        )?;
        counted_qty - theoretical
    };
    conn.execute(
        "UPDATE physical_count_items SET counted_qty = ?1, difference = ?2 WHERE id = ?3",
        rusqlite::params![counted_qty, difference, item_id],
    )?;
    Ok(())
}

/// Obtiene todos los conteos (resumen)
pub fn list_physical_counts(conn: &Connection) -> Result<Vec<PhysicalCount>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, status, notes, created_at FROM physical_counts ORDER BY id DESC LIMIT 50",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PhysicalCount {
            id: row.get(0)?,
            user_id: row.get(1)?,
            status: row.get(2)?,
            notes: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

/// Obtiene un conteo con sus ítems
pub fn get_physical_count(conn: &Connection, count_id: i64) -> Result<PhysicalCountWithItems> {
    let count = conn.query_row(
        "SELECT id, user_id, status, notes, created_at FROM physical_counts WHERE id = ?1",
        [count_id],
        |row| {
            Ok(PhysicalCount {
                id: row.get(0)?,
                user_id: row.get(1)?,
                status: row.get(2)?,
                notes: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    )?;

    let mut stmt = conn.prepare(
        "SELECT pci.id, pci.count_id, pci.product_id, p.name, p.sku, pci.theoretical_qty, pci.counted_qty, pci.difference, pci.adjusted
         FROM physical_count_items pci
         JOIN products p ON p.id = pci.product_id
         WHERE pci.count_id = ?1
         ORDER BY p.name",
    )?;
    let items = stmt.query_map([count_id], |row| {
        Ok(PhysicalCountItem {
            id: row.get(0)?,
            count_id: row.get(1)?,
            product_id: row.get(2)?,
            product_name: row.get(3)?,
            product_sku: row.get(4)?,
            theoretical_qty: row.get(5)?,
            counted_qty: row.get(6)?,
            difference: row.get(7)?,
            adjusted: row.get::<_, i64>(8)? != 0,
        })
    })?;

    let items: Result<Vec<_>> = items.collect();
    Ok(PhysicalCountWithItems {
        count,
        items: items?,
    })
}

/// Aplica los ajustes de inventario para todos los ítems con diferencia y no ajustados
pub fn apply_adjustments(conn: &Connection, count_id: i64) -> Result<()> {
    conn.execute("BEGIN", [])?;

    let mut stmt = conn.prepare(
        "SELECT id, product_id, difference FROM physical_count_items WHERE count_id = ?1 AND adjusted = 0 AND difference != 0",
    )?;
    let items: Vec<(i64, i64, f64)> = stmt
        .query_map([count_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?
        .collect::<Result<Vec<_>>>()?;

    for (item_id, product_id, difference) in &items {
        // Actualizar stock del producto
        conn.execute(
            "UPDATE products SET stock = stock + ?1 WHERE id = ?2",
            rusqlite::params![difference, product_id],
        )?;

        // Registrar movimiento de inventario
        let movement_type = if *difference < 0.0 { "ajuste_negativo" } else { "ajuste_positivo" };
        conn.execute(
            "INSERT INTO inventory_movements (product_id, movement_type, quantity, reason) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![product_id, movement_type, difference.abs(), format!("Conteo físico #{}", count_id)],
        )?;

        // Marcar ítem como ajustado
        conn.execute(
            "UPDATE physical_count_items SET adjusted = 1 WHERE id = ?1",
            [item_id],
        )?;
    }

    // Actualizar estado del conteo
    conn.execute(
        "UPDATE physical_counts SET status = 'aplicado' WHERE id = ?1",
        [count_id],
    )?;

    conn.execute("COMMIT", [])?;
    Ok(())
}

/// Cambia el estado de un conteo
pub fn update_count_status(conn: &Connection, count_id: i64, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE physical_counts SET status = ?1 WHERE id = ?2",
        rusqlite::params![status, count_id],
    )?;
    Ok(())
}

#[derive(Serialize, Debug, Clone)]
pub struct AuditSummary {
    pub total_products: i64,
    pub correct_count: i64,
    pub with_deficit: i64,
    pub with_surplus: i64,
    pub total_deficit_units: f64,
    pub total_surplus_units: f64,
    pub accuracy_percent: f64,
    pub count_id: i64,
    pub count_status: String,
    pub count_notes: String,
    pub count_date: String,
}

/// Genera un resumen ejecutivo de auditoría para un conteo físico
pub fn get_audit_summary(conn: &Connection, count_id: i64) -> Result<AuditSummary> {
    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM physical_count_items WHERE count_id = ?1",
        [count_id], |row| row.get(0),
    )?;
    
    let correct: i64 = conn.query_row(
        "SELECT COUNT(*) FROM physical_count_items WHERE count_id = ?1 AND difference = 0",
        [count_id], |row| row.get(0),
    )?;
    
    let deficit_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM physical_count_items WHERE count_id = ?1 AND difference < 0",
        [count_id], |row| row.get(0),
    )?;
    
    let surplus_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM physical_count_items WHERE count_id = ?1 AND difference > 0",
        [count_id], |row| row.get(0),
    )?;
    
    let deficit_units: f64 = conn.query_row(
        "SELECT COALESCE(SUM(ABS(difference)), 0) FROM physical_count_items WHERE count_id = ?1 AND difference < 0",
        [count_id], |row| row.get(0),
    )?;
    
    let surplus_units: f64 = conn.query_row(
        "SELECT COALESCE(SUM(difference), 0) FROM physical_count_items WHERE count_id = ?1 AND difference > 0",
        [count_id], |row| row.get(0),
    )?;
    
    let accuracy = if total > 0 {
        (correct as f64 / total as f64) * 100.0
    } else {
        100.0
    };

    let (status, notes, date) = conn.query_row(
        "SELECT status, notes, created_at FROM physical_counts WHERE id = ?1",
        [count_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;

    Ok(AuditSummary {
        total_products: total,
        correct_count: correct,
        with_deficit: deficit_count,
        with_surplus: surplus_count,
        total_deficit_units: deficit_units,
        total_surplus_units: surplus_units,
        accuracy_percent: accuracy,
        count_id,
        count_status: status,
        count_notes: notes,
        count_date: date,
    })
}

/// Genera un informe HTML de validación de stock y lo guarda en la carpeta reportes/
pub fn generate_stock_validation_report(conn: &Connection, count_id: i64, business_name: &str) -> Result<String, String> {
    use chrono::Local;
    
    let count = get_physical_count(conn, count_id).map_err(|e| e.to_string())?;
    let summary = get_audit_summary(conn, count_id).map_err(|e| e.to_string())?;
    
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let file_suffix = Local::now().format("%Y%m%d_%H%M%S").to_string();
    
    // Build items HTML
    let mut items_rows = String::new();
    for item in &count.items {
        let diff_type = if item.difference == 0.0 { "Correcto" }
            else if item.difference < 0.0 { "Faltante" }
            else { "Sobrante" };
        let row_class = if item.difference == 0.0 { "" }
            else if item.difference < 0.0 { " style='color:#dc2626;'" }
            else { " style='color:#16a34a;'" };
        
        items_rows.push_str(&format!(
            "<tr{}><td>{}</td><td>{}</td><td align='right'>{:.0}</td><td align='right'>{:.0}</td><td align='right'>{:+.0}</td><td>{}</td></tr>\n",
            row_class, item.product_sku, item.product_name, item.theoretical_qty, item.counted_qty, item.difference, diff_type
        ));
    }
    
    let conclusion = if summary.accuracy_percent == 100.0 {
        format!("El inventario físico coincide exactamente con el stock registrado en el sistema. No se detectaron inconsistencias en los {} productos auditados. La precisión del inventario es del 100%.", summary.total_products)
    } else {
        format!("Se detectaron diferencias de stock en {} de {} productos ({} con faltante y {} con sobrante). Se recomienda revisar movimientos recientes, ventas no registradas, compras pendientes o posibles errores de conteo antes de aplicar ajustes definitivos. Precisión del inventario: {:.1}%.",
            summary.with_deficit + summary.with_surplus, summary.total_products, summary.with_deficit, summary.with_surplus, summary.accuracy_percent)
    };

    let html = format!(r#"<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Validación de Stock #{}</title>
<style>
    *{{margin:0;padding:0;box-sizing:border-box;}}
    body{{font-family:Arial,sans-serif;padding:30px;color:#1e293b;max-width:1000px;margin:auto;}}
    h1{{font-size:22px;margin-bottom:4px;}}
    .subtitle{{color:#64748b;font-size:12px;margin-bottom:20px;}}
    .header{{border-bottom:2px solid #2563eb;padding-bottom:15px;margin-bottom:20px;}}
    .header h1{{color:#2563eb;}}
    table{{width:100%;border-collapse:collapse;margin:15px 0;font-size:12px;}}
    th{{background:#2563eb;color:#fff;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;}}
    td{{padding:6px 10px;border-bottom:1px solid #e2e8f0;}}
    tr:hover{{background:#f8fafc;}}
    .summary-cards{{display:flex;gap:12px;margin:15px 0;flex-wrap:wrap;}}
    .card{{flex:1;min-width:120px;padding:15px;border-radius:8px;text-align:center;}}
    .card-blue{{background:#eff6ff;border:1px solid #bfdbfe;}}
    .card-green{{background:#f0fdf4;border:1px solid #bbf7d0;}}
    .card-red{{background:#fef2f2;border:1px solid #fecaca;}}
    .card-amber{{background:#fffbeb;border:1px solid #fde68a;}}
    .card .num{{font-size:24px;font-weight:bold;}}
    .card .label{{font-size:11px;color:#64748b;margin-top:4px;}}
    .footer{{margin-top:20px;padding-top:15px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;}}
    .conclusion{{background:#f8fafc;border:1px solid #e2e8f0;padding:15px;border-radius:8px;margin:15px 0;font-size:12px;}}
    .conclusion h3{{margin-bottom:8px;font-size:14px;}}
</style></head>
<body>
    <div class="header">
        <h1>📋 Informe de Validación de Stock</h1>
        <div class="subtitle">{} | Auditoría #{} | {}</div>
        <div class="subtitle">Estado: {} | Notas: {}</div>
    </div>

    <h2>Resumen Ejecutivo</h2>
    <div class="summary-cards">
        <div class="card card-blue"><div class="num">{}</div><div class="label">Productos Auditados</div></div>
        <div class="card card-green"><div class="num">{}</div><div class="label">Correctos</div></div>
        <div class="card card-red"><div class="num">{}</div><div class="label">Con Faltante</div></div>
        <div class="card card-amber"><div class="num">{}</div><div class="label">Con Sobrante</div></div>
    </div>
    <div class="summary-cards">
        <div class="card card-blue"><div class="num">{:.1}%</div><div class="label">Precisión del Inventario</div></div>
        <div class="card card-red"><div class="num">{:.0}</div><div class="label">Unidades Faltantes</div></div>
        <div class="card card-amber"><div class="num">{:.0}</div><div class="label">Unidades en Sobrante</div></div>
    </div>

    <h2 style="margin-top:20px;">Detalle por Producto</h2>
    <table>
        <tr><th>SKU</th><th>Producto</th><th>Stock Sistema</th><th>Conteo Físico</th><th>Diferencia</th><th>Tipo</th></tr>
        {}
    </table>

    <div class="conclusion">
        <h3>📌 Conclusión</h3>
        <p>{}</p>
    </div>

    <div class="footer">
        GestaERP - GestaSoftTech &copy; 2026 | www.fundasopaco.org<br>
        Este informe fue generado automáticamente por el módulo de Auditoría de Stock.
    </div>
</body></html>"#,
        count_id, business_name, count_id, now,
        count.count.status, count.count.notes,
        summary.total_products,
        summary.correct_count,
        summary.with_deficit,
        summary.with_surplus,
        summary.accuracy_percent,
        summary.total_deficit_units,
        summary.total_surplus_units,
        items_rows,
        conclusion);
    
    let data_dir = dirs::data_dir().ok_or("No se encontró el directorio de datos del sistema")?;
    let report_dir = data_dir.join("GestaERP").join("reportes");
    std::fs::create_dir_all(&report_dir).map_err(|e| format!("Error al crear carpeta de reportes: {}", e))?;
    
    let filename = format!("validacion_stock_{}.html", file_suffix);
    let path = report_dir.join(&filename);
    std::fs::write(&path, html).map_err(|e| format!("Error al guardar informe: {}", e))?;
    
    Ok(format!("Informe guardado en {}", path.display()))
}
