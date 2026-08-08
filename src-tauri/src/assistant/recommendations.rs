//! Motor 5 — Recomendaciones.
//!
//! El diferencial del producto: en lugar de solo responder, detecta de forma
//! proactiva oportunidades y riesgos del negocio (clientes con saldo pendiente,
//! productos agotados o por debajo del mínimo, tendencia de ventas) y aconseja
//! al empresario.
//!
//! Toda la información proviene de las funciones de dominio existentes
//! (`crate::db::get_dashboard_stats`, `crate::receivables::list_receivables`,
//! `crate::products::list_products`). NUNCA genera SQL.

use crate::AppState;
use tauri::State;

/// Una recomendación/observación concreta para el empresario.
#[derive(Debug, Clone)]
pub struct Recommendation {
    /// Título corto (p. ej. "Cobrar cartera > 30 días").
    pub title: String,
    /// Detalle con datos del negocio.
    pub detail: String,
}

/// Genera el análisis del negocio y lo devuelve como mensaje listo para el chat.
pub fn analyze(state: &State<AppState>) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let s = crate::db::get_dashboard_stats(&conn).map_err(|e| e.to_string())?;

    let mut items: Vec<Recommendation> = Vec::new();

    // 1. Cartera por cobrar -> cobrar.
    let receivables = crate::receivables::list_receivables(&conn).map_err(|e| e.to_string())?;
    let pending: Vec<_> = receivables.iter().filter(|r| r.total > r.paid).collect();
    if !pending.is_empty() {
        let total_pending: f64 = pending.iter().map(|r| r.total - r.paid).sum();
        items.push(Recommendation {
            title: "Cobrar cartera".to_string(),
            detail: format!(
                "Hay **{}** cuenta(s) por cobrar con saldo pendiente por **{}**. Prioriza el cobro.",
                pending.len(),
                cop(total_pending)
            ),
        });
    }

    // 2. Productos agotados / por debajo del mínimo -> reponer.
    let products = crate::products::list_products(&conn, false).map_err(|e| e.to_string())?;
    let agotados: Vec<_> = products.iter().filter(|p| p.stock <= 0.0).collect();
    if !agotados.is_empty() {
        let names: Vec<&str> = agotados.iter().take(5).map(|p| p.name.as_str()).collect();
        items.push(Recommendation {
            title: "Productos agotados".to_string(),
            detail: format!(
                "Tienes **{}** producto(s) sin stock: {}{}.",
                agotados.len(),
                names.join(", "),
                if agotados.len() > 5 { "…" } else { "" }
            ),
        });
    } else if s.productos_bajos > 0 {
        items.push(Recommendation {
            title: "Reponer inventario".to_string(),
            detail: format!(
                "Hay **{}** producto(s) por debajo del stock mínimo. Revisa tus compras.",
                s.productos_bajos
            ),
        });
    }

    // 3. Tendencia de ventas (comparando los últimos 3 días vs los 4 previos).
    if s.ventas_ultimos_7_dias.len() >= 7 {
        let recent_3: f64 = s.ventas_ultimos_7_dias[0..3].iter().sum();
        let prev_4: f64 = s.ventas_ultimos_7_dias[3..7].iter().sum();
        if prev_4 > 0.0 {
            let change = (recent_3 - prev_4) / prev_4 * 100.0;
            if change < -5.0 {
                items.push(Recommendation {
                    title: "Ventas a la baja".to_string(),
                    detail: format!(
                        "Las ventas de los últimos 3 días cayeron **{:.1}%** frente a los 4 anteriores (**{}** → **{}**). Revisa promociones o stock.",
                        change.abs(),
                        cop(prev_4 / 4.0),
                        cop(recent_3 / 3.0)
                    ),
                });
            } else if change > 5.0 {
                items.push(Recommendation {
                    title: "Ventas en alza".to_string(),
                    detail: format!(
                        "Las ventas subieron **{:.1}%** en los últimos 3 días frente a los 4 previos. ¡Buen ritmo!",
                        change
                    ),
                });
            }
        }
    }

    Ok(format_reply(&s, &items))
}

/// Compone el mensaje final con el resumen y la lista de recomendaciones.
fn format_reply(s: &crate::db::DashboardStats, items: &[Recommendation]) -> String {
    let mut out = String::from("📊 **Análisis del negocio**\n\n");
    out.push_str(&format!("· Ventas del mes: **{}**\n", cop(s.ventas_mes)));
    out.push_str(&format!("· Caja actual: **{}**\n", cop(s.caja_actual)));
    out.push_str(&format!("· Ventas de hoy: **{}**\n", cop(s.ventas_hoy)));
    if let Some(estrella) = &s.producto_mas_vendido_mes {
        out.push_str(&format!("· Producto líder: **{}**\n", estrella.name));
    }
    out.push('\n');

    if items.is_empty() {
        out.push_str("✅ **Todo en orden**: no detecté riesgos urgentes. ¡Buen trabajo!");
        return out;
    }

    out.push_str("💡 **Recomendaciones:**\n");
    for (i, r) in items.iter().enumerate() {
        out.push_str(&format!("{}. **{}** — {}\n", i + 1, r.title, r.detail));
    }
    out
}

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
