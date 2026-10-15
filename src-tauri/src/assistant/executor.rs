//! Motor 3 — Ejecutor.
//!
//! En la Fase 1 ejecuta herramientas de CONSULTA (solo lectura) y compone la
//! respuesta legible. Siempre delega en las funciones de dominio existentes
//! (`crate::db::get_dashboard_stats`, `crate::products::list_products`,
//! `crate::sales::get_recent_sales`, ...). NUNCA genera SQL.
//!
//! Las herramientas de escritura (Fase 2+) pasarán por confirmación y se
//! registrarán aquí también, distinguiendo acciones que modifican datos.

use super::permissions::{tool_requires_admin, ROLE_ADMIN};
use super::planner::GestaHelpPlan;
use super::tool_registry::Tool;
use crate::AppState;
use rusqlite::Connection;
use tauri::State;

/// Ejecuta una herramienta de consulta y devuelve la respuesta lista para el chat.
pub fn execute_consult(
    state: &State<AppState>,
    tool: Tool,
    message: &str,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    match tool {
        Tool::GetSalesToday => sales_today(&conn),
        Tool::GetExpensesToday => expenses_today(&conn),
        Tool::GetCashBalance => cash_balance(&conn),
        Tool::GetMonthlyBusiness => monthly_business(&conn),
        Tool::GetLowStock => low_stock(&conn),
        Tool::GetTopProducts => top_products(&conn),
        Tool::GetClientesProveedores => clientes_proveedores(&conn),
        Tool::GetRecentSales => recent_sales(&conn),
        Tool::SearchProduct => search_product(&conn, message),
        Tool::GetOverdueReceivables => overdue_receivables(&conn),
        Tool::CreateCustomer | Tool::RegisterExpense => {
            Err("Esta acción requiere confirmación. Usa el flujo de escritura.".to_string())
        }
    }
}

// ─────────────────────────── Implementaciones ───────────────────────────

fn sales_today(conn: &Connection) -> Result<String, String> {
    let s = crate::db::get_dashboard_stats(conn).map_err(|e| e.to_string())?;
    Ok(format!(
        "📈 **Ventas de hoy**: {} ({} venta{})",
        cop(s.ventas_hoy),
        s.cantidad_ventas_hoy,
        if s.cantidad_ventas_hoy == 1 { "" } else { "s" }
    ))
}

fn expenses_today(conn: &Connection) -> Result<String, String> {
    let s = crate::db::get_dashboard_stats(conn).map_err(|e| e.to_string())?;
    Ok(format!("🧾 **Gastos de hoy**: {}", cop(s.gastos_hoy)))
}

fn cash_balance(conn: &Connection) -> Result<String, String> {
    let s = crate::db::get_dashboard_stats(conn).map_err(|e| e.to_string())?;
    Ok(format!(
        "💵 **Saldo actual de caja**: {}",
        cop(s.caja_actual)
    ))
}

fn monthly_business(conn: &Connection) -> Result<String, String> {
    let s = crate::db::get_dashboard_stats(conn).map_err(|e| e.to_string())?;
    let mut out = String::from("📊 **Resumen del negocio (mes en curso):**\n\n");
    out.push_str(&format!("· Ventas del mes: **{}**\n", cop(s.ventas_mes)));
    out.push_str(&format!("· Gastos del mes: **{}**\n", cop(s.gastos_mes)));
    out.push_str(&format!("· Compras del mes: **{}**\n", cop(s.compras_mes)));
    out.push_str(&format!("· Caja actual: **{}**\n", cop(s.caja_actual)));
    out.push_str(&format!("· Ventas de hoy: **{}**\n", cop(s.ventas_hoy)));

    if let Some(estrella) = &s.producto_mas_vendido_mes {
        out.push_str(&format!(
            "\n🌟 Producto más vendido del mes: **{}** ({} unidades)\n",
            estrella.name,
            fmt_qty(estrella.total_vendido)
        ));
    }
    if !s.top_productos_mes.is_empty() {
        out.push_str("\n🏆 Top productos vendidos del mes:\n");
        for (i, (name, qty)) in s.top_productos_mes.iter().take(5).enumerate() {
            out.push_str(&format!(
                "{}. {} — {} unidades\n",
                i + 1,
                name,
                fmt_qty(*qty)
            ));
        }
    }
    Ok(out)
}

fn low_stock(conn: &Connection) -> Result<String, String> {
    let s = crate::db::get_dashboard_stats(conn).map_err(|e| e.to_string())?;
    // Sin SQL nuevo: filtramos en Rust sobre la lista oficial de productos activos.
    let products = crate::products::list_products(conn, false).map_err(|e| e.to_string())?;
    let mut low: Vec<_> = products.iter().filter(|p| p.stock <= p.min_stock).collect();
    low.sort_by(|a, b| {
        (a.stock - a.min_stock)
            .partial_cmp(&(b.stock - b.min_stock))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut out = format!(
        "⚠️ **Productos por debajo del stock mínimo:** **{}**\n\n",
        s.productos_bajos
    );
    if low.is_empty() {
        out.push_str("¡Todo el inventario está por encima del mínimo! 👍");
    } else {
        for p in low.iter().take(8) {
            out.push_str(&format!(
                "· **{}** — stock: {} (mínimo {})\n",
                p.name,
                fmt_qty(p.stock),
                fmt_qty(p.min_stock)
            ));
        }
        if low.len() > 8 {
            out.push_str(&format!("… y {} más.\n", low.len() - 8));
        }
    }
    Ok(out)
}

fn top_products(conn: &Connection) -> Result<String, String> {
    let s = crate::db::get_dashboard_stats(conn).map_err(|e| e.to_string())?;
    if s.top_productos_mes.is_empty() {
        return Ok(
            "Aún no hay ventas registradas este mes para calcular el top de productos.".to_string(),
        );
    }
    let mut out = String::from("🏆 **Productos más vendidos del mes:**\n");
    for (i, (name, qty)) in s.top_productos_mes.iter().enumerate() {
        out.push_str(&format!(
            "{}. **{}** — {} unidades\n",
            i + 1,
            name,
            fmt_qty(*qty)
        ));
    }
    Ok(out)
}

fn clientes_proveedores(conn: &Connection) -> Result<String, String> {
    let s = crate::db::get_dashboard_stats(conn).map_err(|e| e.to_string())?;
    Ok(format!(
        "👥 **Clientes**: {} · 🏢 **Proveedores**: {} · 📦 **Productos activos**: {}",
        s.total_clientes, s.total_proveedores, s.productos_activos
    ))
}

fn recent_sales(conn: &Connection) -> Result<String, String> {
    let sales = crate::sales::get_recent_sales(conn).map_err(|e| e.to_string())?;
    if sales.is_empty() {
        return Ok("Aún no hay ventas registradas.".to_string());
    }
    let mut out = String::from("🧾 **Últimas ventas:**\n");
    for sw in sales.iter().take(5) {
        let items: Vec<String> = sw
            .items
            .iter()
            .map(|it| format!("{} x{}", it.product_name, fmt_qty(it.quantity)))
            .collect();
        out.push_str(&format!(
            "· **{}** · {} · {} · {}\n",
            sw.sale.created_at,
            cop(sw.sale.total),
            payment_label(&sw.sale.payment_method),
            items.join(", ")
        ));
    }
    Ok(out)
}

fn search_product(conn: &Connection, message: &str) -> Result<String, String> {
    let term = extract_term(message);
    if term.is_empty() {
        return Ok(
            "Dime qué producto buscas, por ejemplo: *“busca el producto aceite 20W50”*."
                .to_string(),
        );
    }
    let products = crate::products::list_products(conn, true).map_err(|e| e.to_string())?;
    let term_lower = term.to_lowercase();
    let matches: Vec<_> = products
        .iter()
        .filter(|p| {
            p.name.to_lowercase().contains(&term_lower)
                || p.sku.to_lowercase().contains(&term_lower)
        })
        .collect();

    if matches.is_empty() {
        return Ok(format!(
            "No encontré ningún producto que coincida con **“{}”**.",
            term
        ));
    }
    let mut out = format!("🔎 **Resultados para “{}”** ({}):\n", term, matches.len());
    for p in matches.iter().take(6) {
        out.push_str(&format!(
            "· **{}** ({}) — {} · stock: {}\n",
            p.name,
            p.sku,
            cop(p.price),
            fmt_qty(p.stock)
        ));
    }
    Ok(out)
}

fn overdue_receivables(conn: &Connection) -> Result<String, String> {
    let receivables = crate::receivables::list_receivables(conn).map_err(|e| e.to_string())?;
    let pending: Vec<_> = receivables.iter().filter(|r| r.total > r.paid).collect();
    if pending.is_empty() {
        return Ok("🎉 No hay cuentas por cobrar con saldo pendiente.".to_string());
    }
    let mut out = format!(
        "💰 **Cuentas por cobrar con saldo pendiente** ({}):\n",
        pending.len()
    );
    for r in pending.iter().take(10) {
        let balance = r.total - r.paid;
        out.push_str(&format!(
            "· **{}** — saldo: {} · total: {}\n",
            r.customer_name,
            cop(balance),
            cop(r.total)
        ));
    }
    Ok(out)
}

// ─────────────────────────── Utilidades de formato ───────────────────────────

/// Formatea un número como moneda colombiana (COP): $1.234.567,89
fn cop(value: f64) -> String {
    let abs = value.abs();
    let int = abs.trunc() as u64;
    let dec = ((abs - abs.trunc()) * 100.0).round() as u64;
    let s = int.to_string();
    let mut grouped = String::new();
    for (i, ch) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(ch);
    }
    let sign = if value < 0.0 { "-" } else { "" };
    format!("{sign}${grouped},{dec:02}")
}

/// Formatea una cantidad (stock/unidades) sin decimales si es entera.
fn fmt_qty(value: f64) -> String {
    if (value - value.trunc()).abs() < f64::EPSILON {
        format!("{}", value.trunc() as i64)
    } else {
        format!("{:.2}", value)
    }
}

fn payment_label(method: &str) -> &str {
    match method {
        "cash" => "Efectivo",
        "card" => "Tarjeta",
        "transfer" => "Transferencia",
        "credit" => "Crédito",
        _ => method,
    }
}

/// Extrae un término de búsqueda simple del mensaje del usuario (texto entre
/// comillas o las palabras restantes tras quitar palabras de relleno).
fn extract_term(message: &str) -> String {
    let m = message.to_lowercase();
    if let Some(start) = m.find('"') {
        let rest = &m[start + 1..];
        if let Some(end) = rest.find('"') {
            return rest[..end].trim().to_string();
        }
    }
    const STOP: &[&str] = &[
        "busca",
        "buscar",
        "el",
        "la",
        "los",
        "las",
        "de",
        "del",
        "producto",
        "articulo",
        "artículo",
        "precio",
        "cuanto",
        "cuánto",
        "cuesta",
        "tiene",
        "sku",
        "disponible",
        "tienes",
        "un",
        "una",
        "y",
        "que",
        "cual",
        "cuál",
        "esta",
        "está",
        "por",
        "para",
    ];
    let words: Vec<&str> = m.split_whitespace().filter(|w| !STOP.contains(w)).collect();
    words.join(" ")
}

// ─────────────────────── Escritura (Fase 2, con confirmación) ───────────────────────

/// Ejecuta una herramienta de ESCRITURA confirmada. Siempre delega en las
/// funciones de dominio existentes y registra la acción en `audit_logs`.
///
/// `role` es el rol del usuario autenticado; se valida según `permissions`.
pub fn execute_write(
    state: &State<AppState>,
    plan: &GestaHelpPlan,
    user_id: i64,
    username: &str,
    role: &str,
) -> Result<String, String> {
    if tool_requires_admin(&plan.tool) && role != ROLE_ADMIN {
        return Err("No autorizado: esta acción requiere privilegios de administrador".to_string());
    }
    if plan.tool == "tool_create_customer" {
        return Err(
            "Usa el formulario del módulo Clientes para registrar la base y finalidad del tratamiento."
                .to_string(),
        );
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    match plan.tool.as_str() {
        "tool_register_expense" => register_expense_exec(&conn, &plan.params, user_id, username),
        other => Err(format!("Herramienta de escritura no soportada: {other}")),
    }
}

fn register_expense_exec(
    conn: &Connection,
    params: &std::collections::HashMap<String, String>,
    user_id: i64,
    username: &str,
) -> Result<String, String> {
    let description = params
        .get("description")
        .cloned()
        .unwrap_or_else(|| "Gasto".to_string());
    let amount = params
        .get("amount")
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0);
    if amount <= 0.0 {
        return Err("Falta un monto válido para el gasto".to_string());
    }
    let category = params
        .get("category")
        .cloned()
        .unwrap_or_else(|| "General".to_string());
    let payment_method = params
        .get("payment_method")
        .cloned()
        .unwrap_or_else(|| "Efectivo".to_string());

    let id = crate::expenses::create_expense(
        conn,
        user_id,
        &description,
        amount,
        &category,
        &payment_method,
        None,
        None,
    )
    .map_err(|e| format!("Error al registrar el gasto: {e}"))?;

    crate::audit::log_action(
        conn,
        user_id,
        username,
        "expenses",
        id,
        "CREATE",
        None,
        Some(&format!("{description} / {}", cop(amount))),
    );
    Ok(format!(
        "✅ **Gasto registrado**: {description} por {}.",
        cop(amount)
    ))
}
