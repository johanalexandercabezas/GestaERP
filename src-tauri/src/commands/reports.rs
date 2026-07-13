use tauri::State;
use crate::AppState;
use crate::auth_guard;
use crate::utils::csv_quote;
use std::fs::File;
use std::io::Write;


#[tauri::command]
pub fn generate_sales_report(state: State<AppState>) -> Result<String, String> {
    auth_guard::require_auth(&state)?;

    // CORRECCIÓN: Ruta segura
    let app_dir = dirs::data_dir().ok_or("No se encontró directorio")?.join("GestaERP").join("reportes");
    std::fs::create_dir_all(&app_dir).map_err(|e| format!("Error al crear carpeta reportes: {}", e))?;
    
    let filename = format!("ventas_{}.pdf", chrono::Local::now().format("%Y%m%d_%H%M%S"));
    let path = app_dir.join(&filename);
    let path_str = path.display().to_string();
    
    let conn = state.db.lock().map_err(|e| format!("Error al abrir base de datos: {}", e))?;
    crate::reports::generate_sales_report(&conn, &path_str)?;
    Ok(format!("Reporte guardado en {}", path_str))
}

#[tauri::command]
pub fn export_report_to_csv(state: State<AppState>, report_type: String, period: String) -> Result<String, String> {
    auth_guard::require_auth(&state)?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let app_dir = dirs::data_dir()
        .ok_or("No se encontró el directorio de datos del sistema")?
        .join("GestaERP")
        .join("reportes");
    std::fs::create_dir_all(&app_dir).map_err(|e| format!("Error al crear carpeta reportes: {}", e))?;

    let (resumen_file, detalle_file) = match report_type.as_str() {
        "sales" => (
            app_dir.join(format!("ventas_{}_resumen.csv", period)),
            app_dir.join(format!("ventas_{}_detalle.csv", period)),
        ),
        "purchases" => (
            app_dir.join(format!("compras_{}_resumen.csv", period)),
            app_dir.join(format!("compras_{}_detalle.csv", period)),
        ),
        _ => return Err("Tipo de reporte no soportado".to_string()),
    };

    match report_type.as_str() {
        "sales" => {
            let mut resumen = File::create(&resumen_file).map_err(|e| e.to_string())?;
            writeln!(resumen, "ID Venta,Fecha,Método,Total").map_err(|e| e.to_string())?;
            let mut detalle = File::create(&detalle_file).map_err(|e| e.to_string())?;
            writeln!(detalle, "ID Venta,Fecha,Producto,Cantidad,Precio Unitario,Subtotal")
                .map_err(|e| e.to_string())?;

            let mut stmt = conn
                .prepare("SELECT id, created_at, payment_method, total FROM sales WHERE strftime('%Y-%m', created_at) = ?1 ORDER BY id DESC LIMIT 500")
                .map_err(|e| e.to_string())?;
            let sales = stmt
                .query_map([&period], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, f64>(3)?))
                })
                .map_err(|e| e.to_string())?;

            for sale in sales {
                let (sale_id, date, method, total) = sale.map_err(|e| e.to_string())?;
                writeln!(resumen, "{},{},{},{}", sale_id, csv_quote(&date), csv_quote(&method), total)
                    .map_err(|e| e.to_string())?;

                let mut item_stmt = conn
                    .prepare("SELECT p.name, si.quantity, si.unit_price, si.total_price FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = ?1")
                    .map_err(|e| e.to_string())?;
                let items = item_stmt
                    .query_map([sale_id], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?, row.get::<_, f64>(2)?, row.get::<_, f64>(3)?))
                    })
                    .map_err(|e| e.to_string())?;
                for item in items {
                    let (name, qty, price, subtotal) = item.map_err(|e| e.to_string())?;
                    writeln!(detalle, "{},{},{},{},{},{}", sale_id, csv_quote(&date), csv_quote(&name), qty, price, subtotal)
                        .map_err(|e| e.to_string())?;
                }
            }
        }
        "purchases" => {
            let mut resumen = File::create(&resumen_file).map_err(|e| e.to_string())?;
            writeln!(resumen, "ID Compra,Fecha,Proveedor,Factura,Total")
                .map_err(|e| e.to_string())?;

            let mut detalle = File::create(&detalle_file).map_err(|e| e.to_string())?;
            writeln!(detalle, "ID Compra,Fecha,Producto,Descripción,Cantidad,Costo Unitario,Subtotal")
                .map_err(|e| e.to_string())?;

            let mut stmt = conn
                .prepare("SELECT id, created_at, supplier_name, invoice_number, total FROM purchases WHERE strftime('%Y-%m', created_at) = ?1 ORDER BY id DESC LIMIT 500")
                .map_err(|e| e.to_string())?;
            let purchases = stmt
                .query_map([&period], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, f64>(4)?))
                })
                .map_err(|e| e.to_string())?;

            for purchase in purchases {
                let (purchase_id, date, supplier, invoice, total) = purchase.map_err(|e| e.to_string())?;
                writeln!(resumen, "{},{},{},{},{}", purchase_id, csv_quote(&date), csv_quote(&supplier), csv_quote(&invoice), total)
                    .map_err(|e| e.to_string())?;

                let mut item_stmt = conn
                    .prepare("SELECT pi.product_name, pi.description, pi.quantity, pi.unit_cost, pi.total_cost FROM purchase_items pi WHERE pi.purchase_id = ?1")
                    .map_err(|e| e.to_string())?;
                let items = item_stmt
                    .query_map([purchase_id], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?, row.get::<_, f64>(3)?, row.get::<_, f64>(4)?))
                    })
                    .map_err(|e| e.to_string())?;
                for item in items {
                    let (name, desc, qty, unit_cost, subtotal) = item.map_err(|e| e.to_string())?;
                    writeln!(detalle, "{},{},{},{},{},{},{}", purchase_id, csv_quote(&date), csv_quote(&name), csv_quote(&desc), qty, unit_cost, subtotal)
                        .map_err(|e| e.to_string())?;
                }
            }
        }
        _ => unreachable!(),
    }

    Ok(format!("Reportes guardados:\n- {}\n- {}", resumen_file.display(), detalle_file.display()))
}