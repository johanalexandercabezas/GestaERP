//! Motor 1 — Comprensión.
//!
//! Única responsabilidad: determinar QUÉ quiere el usuario a partir del texto.
//! La implementación actual usa reglas locales. Este es el punto de extensión
//! para otro motor que implemente el mismo contrato; GestaHelp no llama a un
//! modelo local ni a un proveedor externo.

use super::context::Context;

/// Clasificación de la intención del usuario.
/// La enumeración es de solo crecimiento: cada fase añade variantes sin romper
/// el contrato con el comando `gestahelp::chat`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IntentKind {
    /// Motor 1: consultar datos del ERP (solo lectura).
    Consult,
    /// Motor 1 + 3: crear/modificar datos (requiere confirmación antes de ejecutar).
    Create,
    /// Motor 4: explicar cómo funciona GestaERP (no toca datos).
    Explain,
    /// Motor 5: análisis / recomendaciones del negocio.
    Analyze,
    /// No se pudo clasificar.
    Unknown,
}

/// Contrato del clasificador de intenciones.
pub trait IntentEngine: Send + Sync {
    fn analyze_intent(&self, message: &str) -> IntentKind;
}

/// Implementación actual por reglas; funciona 100% sin conexión.
pub struct RuleEngine;

impl IntentEngine for RuleEngine {
    fn analyze_intent(&self, message: &str) -> IntentKind {
        analyze_rules(message)
    }
}

/// Devuelve el motor de comprensión actual.
pub fn default_engine() -> Box<dyn IntentEngine> {
    Box::new(RuleEngine)
}

/// Clasificador basado en reglas (núcleo del `RuleEngine`).
fn analyze_rules(message: &str) -> IntentKind {
    let m = message.to_lowercase();

    if contains_any(
        &m,
        &[
            "crear",
            "crea un",
            "crea el",
            "crea la",
            "registrar",
            "registra un",
            "registra el",
            "registra la",
            "agregar",
            "agrega un",
            "agrega el",
            "añadir",
            "añade un",
            "añade el",
            "nueva ",
            "nuevo ",
            "generar una",
            "genere una",
            "haz una",
            "haz un",
            "hacer una",
            "facturar",
        ],
    ) {
        IntentKind::Create
    } else if contains_any(
        &m,
        &[
            "cómo",
            "como funciona",
            "que es",
            "qué es",
            "funciona",
            "explica",
            "explicar",
            "manual",
            "paso a paso",
            "guía",
            "aprende",
        ],
    ) {
        IntentKind::Explain
    } else if contains_any(
        &m,
        &[
            "recomienda",
            "recomiéndame",
            "recomendación",
            "analiza",
            "analizar",
            "cómo va",
            "diagnóstico",
            "dime qué hago",
            "qué hago",
            "opinión",
            "oportunidad de mejora",
        ],
    ) {
        IntentKind::Analyze
    } else if contains_any(
        &m,
        &[
            "cuánto",
            "cuanto",
            "ventas",
            "vendi",
            "vendimos",
            "vendido",
            "caja",
            "saldo",
            "stock",
            "inventario",
            "producto",
            "productos",
            "cliente",
            "clientes",
            "compra",
            "compras",
            "gastos",
            "gasto",
            "total",
            "listar",
            "lista",
            "mostrar",
            "dime",
            "balance",
            "facturas",
            "hoy",
            "mes",
            "semana",
            "quién",
            "quien",
            "cuál",
            "cual",
            "cuántas",
            "cuántos",
        ],
    ) {
        IntentKind::Consult
    } else {
        IntentKind::Unknown
    }
}

/// Guía al usuario cuando el mensaje no coincide con una consulta o acción disponible.
pub fn build_reply(message: &str, kind: IntentKind, ctx: &Context) -> String {
    let area = ctx.display_name();
    let normalized_message = message.to_lowercase();
    let example = match ctx.view.as_deref() {
        Some("products") => "¿qué productos están por debajo del stock mínimo?",
        Some("pos") => "¿cuánto vendimos hoy?",
        Some("cash") => "¿cuál es el saldo actual de caja?",
        Some("expenses") => "¿cuánto gastamos hoy?",
        Some("receivables") => "¿qué cuentas por cobrar están pendientes?",
        Some("customers") => "¿cómo registro un cliente?",
        Some("purchases") => "¿cómo registro una compra?",
        Some("payroll") => "¿cómo genero la nómina?",
        _ => "¿cuánto vendimos hoy?",
    };

    match kind {
        IntentKind::Create
            if contains_any(&normalized_message, &["cliente", "persona"]) =>
        {
            "Para registrar un cliente con su trazabilidad de tratamiento, usa el formulario del módulo **Clientes**. No he cambiado ningún dato.".to_string()
        }
        IntentKind::Create => format!(
            "No pude preparar esa acción a partir de **\"{}\"** y no he cambiado ningún dato. \
             Puedo preparar el registro de gastos. Prueba, por ejemplo: \
             **\"registra un gasto de 25000 por arriendo\"**.",
            message.trim()
        ),
        IntentKind::Consult => format!(
            "No identifiqué qué dato quieres consultar en **{area}**. No ejecuté ninguna consulta. \
             Prueba con: **\"{example}\"**."
        ),
        IntentKind::Explain => format!(
            "Aún no tengo una guía específica para **\"{}\"**. Puedo explicar procedimientos del ERP; \
             por ejemplo, **\"¿cómo funciona el cierre de caja?\"**. También puedes consultar ayuda \
             sobre el módulo **{area}**.",
            message.trim()
        ),
        IntentKind::Analyze => format!(
            "No pude relacionar esa solicitud con un análisis disponible. Prueba con \
             **\"¿qué productos debo reponer?\"** o pide un resumen del mes."
        ),
        IntentKind::Unknown => format!(
            "No entendí **\"{}\"**. Soy un asistente local basado en guías y consultas disponibles \
             del ERP; no soy un modelo generativo ni envío el chat a un servicio externo. \
             Desde **{area}**, prueba: **\"{example}\"**.",
            message.trim()
        ),
    }
}

fn contains_any(text: &str, keys: &[&str]) -> bool {
    keys.iter().any(|k| text.contains(k))
}
#[cfg(test)]
mod tests {
    use super::*;

    /// Clasifica a través de la interfaz (como lo hará el comando real).
    fn kind(msg: &str) -> IntentKind {
        default_engine().analyze_intent(msg)
    }

    #[test]
    fn detecta_consulta_de_ventas() {
        assert_eq!(kind("¿cuánto vendimos hoy?"), IntentKind::Consult);
    }

    #[test]
    fn detecta_consulta_de_caja() {
        assert_eq!(kind("cuál es el saldo de caja"), IntentKind::Consult);
    }

    #[test]
    fn detecta_creacion() {
        assert_eq!(kind("crea un cliente Comercial ABC"), IntentKind::Create);
    }

    #[test]
    fn detecta_registro_de_gasto() {
        assert_eq!(kind("registrar un gasto de arriendo"), IntentKind::Create);
    }

    #[test]
    fn detecta_explicacion() {
        assert_eq!(kind("cómo funciona el cierre de caja"), IntentKind::Explain);
    }

    #[test]
    fn detecta_analisis_recomendacion() {
        assert_eq!(kind("qué me recomiendas"), IntentKind::Analyze);
    }

    #[test]
    fn mensaje_desconocido() {
        assert_eq!(kind("hola que tal"), IntentKind::Unknown);
    }

    #[test]
    fn respuesta_desconocida_explica_alcance_sin_mencionar_fases_falsas() {
        let reply = build_reply(
            "hola que tal",
            IntentKind::Unknown,
            &Context::new(Some("cash".to_string())),
        );
        assert!(reply.contains("asistente local"));
        assert!(reply.contains("saldo actual de caja"));
        assert!(!reply.contains("Fase 0"));
    }

    #[test]
    fn creacion_no_soportada_indica_que_no_modifico_datos() {
        let reply = build_reply(
            "crea una factura",
            IntentKind::Create,
            &Context::new(Some("pos".to_string())),
        );
        assert!(reply.contains("no he cambiado ningún dato"));
    }
}
