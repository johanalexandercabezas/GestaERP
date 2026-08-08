//! Motor 3 — Planificador.
//!
//! Decide QUÉ herramienta atiende la intención del usuario.
//!
//! - Para lecturas (Consult/Analyze): planifica la herramienta de consulta y
//!   el `executor` la ejecuta de inmediato (no requiere confirmación).
//! - Para escritura (Create): en la Fase 2 el planificador generará un `Plan`
//!   con un resumen ("Voy a crear: Cliente: X · ¿Deseas continuar?") y NO
//!   ejecutará hasta la confirmación.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::context::Context;
use super::intent_engine::IntentKind;
use super::tool_registry::Tool;

/// Plan de acción pendiente de confirmación del usuario.
/// Es serializable para viajar al frontend y volver sin estado en el backend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GestaHelpPlan {
    /// Nombre canónico de la herramienta a ejecutar (ver `Tool::name`).
    pub tool: String,
    /// Resumen legible de lo que se hará (se muestra antes de confirmar).
    pub summary: String,
    /// Parámetros tipados como texto; el executor los interpreta por herramienta.
    pub params: HashMap<String, String>,
}

impl GestaHelpPlan {
    pub fn new(tool: &str, summary: String, params: HashMap<String, String>) -> Self {
        GestaHelpPlan {
            tool: tool.to_string(),
            summary,
            params,
        }
    }
}

/// Selecciona la herramienta de consulta adecuada para la intención.
/// Devuelve `None` si la intención no es de consulta/análisis (p.ej. creación
/// o explicación, que se manejan en otros motores).
pub fn select_tool(message: &str, kind: IntentKind, _ctx: &Context) -> Option<Tool> {
    if !matches!(kind, IntentKind::Consult | IntentKind::Analyze) {
        return None;
    }
    let m = message.to_lowercase();

    // Cartera / cuentas por cobrar con saldo pendiente
    if contains_any(
        &m,
        &[
            "cartera",
            "vencidas",
            "vencido",
            "cuentas por cobrar",
            "moroso",
            "por cobrar",
            "quién me debe",
            "quien me debe",
            "me deben",
        ],
    ) {
        return Some(Tool::GetOverdueReceivables);
    }

    // Stock bajo / productos por reponer
    if contains_any(
        &m,
        &[
            "stock bajo",
            "agotad",
            "inventario bajo",
            "productos bajos",
            "falta inventario",
            "reponer",
            "por debajo",
            "qué tengo que comprar",
        ],
    ) {
        return Some(Tool::GetLowStock);
    }

    // Caja / saldo disponible
    if contains_any(
        &m,
        &[
            "caja",
            "saldo",
            "efectivo en caja",
            "balance de caja",
            "cuánto hay en caja",
            "cuanto hay en caja",
            "dinero en caja",
        ],
    ) {
        return Some(Tool::GetCashBalance);
    }

    // Gastos de hoy
    if contains_any(
        &m,
        &["gastos de hoy", "gasto de hoy", "gastos hoy", "gasto hoy"],
    ) {
        return Some(Tool::GetExpensesToday);
    }

    // Ventas de hoy
    if contains_any(
        &m,
        &[
            "ventas de hoy",
            "ventas hoy",
            "vendimos hoy",
            "vendi hoy",
            "vendi el dia",
            "ventas del día",
            "ventas del dia",
            "cuánto vendimos",
            "cuanto vendimos",
            "cuánto vendi",
            "cuanto vendi",
            "ventas de lo que va del dia",
        ],
    ) {
        return Some(Tool::GetSalesToday);
    }

    // Productos más vendidos
    if contains_any(
        &m,
        &[
            "más vendido",
            "mas vendido",
            "top producto",
            "top ",
            "producto estrella",
            "qué producto se vende",
            "que producto se vende",
            "mejor vende",
            "cuál es el producto",
            "cual es el producto",
        ],
    ) {
        return Some(Tool::GetTopProducts);
    }

    // Últimas ventas / facturas recientes
    if contains_any(
        &m,
        &[
            "últimas ventas",
            "ultimas ventas",
            "última venta",
            "ultima venta",
            "ventas recientes",
            "últimas facturas",
            "ultimas facturas",
            "listar ventas",
            "lista de ventas",
        ],
    ) {
        return Some(Tool::GetRecentSales);
    }

    // Cantidad de clientes / proveedores
    if contains_any(
        &m,
        &[
            "cuántos clientes",
            "cuantos clientes",
            "nº de clientes",
            "número de clientes",
            "num de clientes",
            "total clientes",
            "total proveedores",
            "cuántos proveedores",
            "cuantos proveedores",
        ],
    ) {
        return Some(Tool::GetClientesProveedores);
    }

    // Búsqueda de producto concreto
    if contains_any(
        &m,
        &[
            "busca el producto",
            "buscar producto",
            "busca producto",
            "busca el articulo",
            "qué precio tiene",
            "que precio tiene",
            "cuánto cuesta",
            "cuanto cuesta",
            "precio de",
            "sku",
            "disponible el producto",
            "tienes el producto",
            "tienes producto",
        ],
    ) {
        return Some(Tool::SearchProduct);
    }

    // Por defecto, para consultas genéricas se ofrece el resumen del negocio.
    Some(Tool::GetMonthlyBusiness)
}

fn contains_any(text: &str, keys: &[&str]) -> bool {
    keys.iter().any(|k| text.contains(k))
}

/// Genera un plan de acción para intenciones de ESCRITURA (Motor 3).
/// Devuelve `None` si no se puede estructurar la acción (se responde guiando).
pub fn plan_create(message: &str) -> Option<GestaHelpPlan> {
    let m = message.to_lowercase();

    // Gastos primero (evita colisión con el concepto de "proveedor" en compras).
    if contains_any(
        &m,
        &[
            "registrar un gasto",
            "registra un gasto",
            "registrar gasto",
            "registra gasto",
            "crear un gasto",
            "crea un gasto",
            "ingresar un gasto",
            "agregar un gasto",
            "anotar un gasto",
            "gasto de ",
            "gasto por ",
        ],
    ) {
        return plan_expense(message);
    }

    // Crear cliente.
    if contains_any(&m, &["cliente", "persona"])
        && contains_any(
            &m,
            &[
                "crea",
                "crear",
                "registra",
                "registrar",
                "agregar",
                "agrega",
                "añade",
                "añadir",
                "nuevo",
                "nueva",
                "alta",
            ],
        )
    {
        return plan_customer(message);
    }

    None
}

// ─────────────────────── Plan: crear cliente ───────────────────────

fn plan_customer(message: &str) -> Option<GestaHelpPlan> {
    let name = extract_customer_name(message)?;

    let lower = message.to_lowercase();
    let doc_type = if lower.contains("nit") {
        Some("NIT".to_string())
    } else if lower.contains("cc ") || lower.contains("cedula") || lower.contains("cédula") {
        Some("CC".to_string())
    } else {
        None
    };
    let doc_number = first_number(message)
        .filter(|n| *n >= 100000.0)
        .map(|n| format!("{}", n as u64));
    let email = extract_email(message);

    let mut params = HashMap::new();
    params.insert("name".to_string(), name.clone());
    if let Some(dt) = &doc_type {
        params.insert("doc_type".to_string(), dt.clone());
    }
    if let Some(dn) = &doc_number {
        params.insert("doc_number".to_string(), dn.clone());
    }
    if let Some(em) = &email {
        params.insert("email".to_string(), em.clone());
    }

    let mut summary = format!("✅ Voy a **crear el cliente**:\n· **Nombre**: {name}");
    if let Some(dt) = &doc_type {
        summary.push_str(&format!("\n· **Tipo doc.**: {dt}"));
    }
    if let Some(dn) = &doc_number {
        summary.push_str(&format!("\n· **Número**: {dn}"));
    }
    if let Some(em) = &email {
        summary.push_str(&format!("\n· **Email**: {em}"));
    }

    Some(GestaHelpPlan::new(
        Tool::CreateCustomer.name(),
        summary,
        params,
    ))
}

// ─────────────────────── Plan: registrar gasto ───────────────────────

fn plan_expense(message: &str) -> Option<GestaHelpPlan> {
    let amount = first_number(message)?;
    let lower = message.to_lowercase();

    let description = labeled_value(
        message,
        &[
            "concepto:",
            "descripcion:",
            "descripción:",
            "detalle:",
            "por ",
            "de ",
        ],
    )
    .or_else(|| fallback_after_keyword(message, "gasto"))
    .unwrap_or_else(|| "Gasto".to_string());

    let category = labeled_value(message, &["categoria:", "categoría:", "tipo:", "rubro:"])
        .unwrap_or_else(|| "General".to_string());

    let payment_method = if lower.contains("tarjeta") {
        "Tarjeta".to_string()
    } else if lower.contains("transferencia")
        || lower.contains("nequi")
        || lower.contains("bancolombia")
    {
        "Transferencia".to_string()
    } else {
        "Efectivo".to_string()
    };

    let mut params = HashMap::new();
    params.insert("amount".to_string(), format!("{}", amount));
    params.insert("description".to_string(), description.clone());
    params.insert("category".to_string(), category.clone());
    params.insert("payment_method".to_string(), payment_method.clone());

    let summary = format!(
        "✅ Voy a **registrar el gasto**:\n· **Descripción**: {description}\n· **Monto**: {:.2}\n· **Categoría**: {category}\n· **Pago**: {payment_method}",
        amount
    );

    Some(GestaHelpPlan::new(
        Tool::RegisterExpense.name(),
        summary,
        params,
    ))
}

// ─────────────────────── Helpers de parseo ───────────────────────

/// Extrae el nombre del cliente: de un campo rotulado ("cliente:", "nombre:") o
/// de la palabra "cliente" seguida de texto hasta un delimitador conocido.
fn extract_customer_name(message: &str) -> Option<String> {
    for label in ["cliente:", "nombre:", "name:", "cliente "] {
        if let Some(pos) = message.to_lowercase().find(label) {
            let rest = &message[pos + label.len()..];
            let seg = clean_segment(rest);
            if !seg.is_empty() {
                return Some(seg);
            }
        }
    }
    None
}

/// Recorta un segmento de texto hasta un delimitador de campo conocido.
fn clean_segment(text: &str) -> String {
    let mut seg = text
        .trim_start_matches([' ', ':', ',', '-', '_'])
        .to_string();
    for d in [
        " con ",
        " nit ",
        " nit:",
        " cc ",
        " cedula ",
        " cédula ",
        " telefono ",
        " teléfono ",
        " tel:",
        " email:",
        " correo:",
        " ciudad:",
        " de ",
        " y ",
        "\n",
    ] {
        if let Some(p) = seg.to_lowercase().find(d) {
            seg.truncate(p);
        }
    }
    seg.trim().to_string()
}

/// Valor tras una etiqueta con ':' (p.ej. "concepto: arriendo").
fn labeled_value(message: &str, labels: &[&str]) -> Option<String> {
    let lower = message.to_lowercase();
    for label in labels {
        if let Some(pos) = lower.find(label) {
            let rest = &message[pos + label.len()..];
            let cut = rest.find(':').unwrap_or(rest.len());
            let seg = clean_segment(&rest[..cut]);
            if !seg.is_empty() {
                return Some(seg);
            }
        }
    }
    None
}

/// Texto después de una palabra clave (p.ej. después de "gasto").
fn fallback_after_keyword(message: &str, keyword: &str) -> Option<String> {
    let lower = message.to_lowercase();
    if let Some(pos) = lower.find(keyword) {
        let rest = &message[pos + keyword.len()..];
        let seg = clean_segment(rest);
        if !seg.is_empty() {
            return Some(seg);
        }
    }
    None
}

/// Primer número presente en el mensaje (entero o decimal con . o ,).
fn first_number(message: &str) -> Option<f64> {
    let bytes = message.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len()
                && (bytes[i].is_ascii_digit() || bytes[i] == b'.' || bytes[i] == b',')
            {
                i += 1;
            }
            let cleaned = message[start..i].replace(',', ".");
            if let Ok(v) = cleaned.parse::<f64>() {
                return Some(v);
            }
        } else {
            i += 1;
        }
    }
    None
}

/// Extrae una dirección de correo simple del texto.
fn extract_email(message: &str) -> Option<String> {
    let lower = message.to_lowercase();
    let at = lower.find('@')?;
    let start = lower[..at]
        .rfind(|c: char| !c.is_alphanumeric() && c != '.' && c != '_' && c != '-')
        .map(|p| p + 1)
        .unwrap_or(0);
    let end = lower[at + 1..]
        .find(|c: char| !c.is_alphanumeric() && c != '.' && c != '-')
        .map(|p| at + 1 + p)
        .unwrap_or(message.len());
    Some(message[start..end].to_string())
}
