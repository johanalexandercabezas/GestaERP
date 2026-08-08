//! Motor 1 — Comprensión.
//!
//! Única responsabilidad: determinar QUÉ quiere el usuario a partir del texto.
//! Fase 0 implementa un clasificador basado en reglas (RuleEngine). Este es el
//! punto donde, en fases posteriores, se enchufará un LLM local o un proveedor
//! externo sin cambiar nada más de la arquitectura: basta con que el motor
//! devuelva el mismo `IntentKind`.

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

/// Motor 1 — Comprensión: interfaz. Permite enchufar un LLM (local o proveedor)
/// SIN tocar el resto de la arquitectura: basta con que la implementación
/// devuelva el mismo `IntentKind`.
pub trait IntentEngine: Send + Sync {
    fn analyze_intent(&self, message: &str) -> IntentKind;
}

/// Implementación por reglas (predeterminada, funciona 100% sin conexión).
pub struct RuleEngine;

impl IntentEngine for RuleEngine {
    fn analyze_intent(&self, message: &str) -> IntentKind {
        analyze_rules(message)
    }
}

/// Devuelve el motor de comprensión actual. Es el ÚNICO punto para cambiar de
/// motor: sustituir `RuleEngine` por un `LocalLlmEngine`/proveedor sin alterar
/// el comando. `default_engine()` es reemplazable en esta función.
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

/// Compone la respuesta literal del asistente a la intención detectada.
/// En la Fase 0 no ejecuta herramientas: orienta al usuario y confirma la
/// conexión real con el backend. Las fases 1+ reemplazan este texto por
/// resultados reales de consulta/análisis.
pub fn build_reply(message: &str, kind: IntentKind, ctx: &Context) -> String {
    let area = ctx.view.as_deref().unwrap_or("ERP");
    let _ = message;

    let intro = match kind {
        IntentKind::Consult => {
            format!("Entendí que quieres **consultar** información de **{area}**.")
        }
        IntentKind::Create => {
            format!("Entendí que quieres **crear o modificar** un registro en **{area}**.")
        }
        IntentKind::Explain => {
            format!("Entendí que quieres que te **explique** cómo funciona algo en **{area}**.")
        }
        IntentKind::Analyze => {
            format!("Entendí que quieres un **análisis** del negocio desde **{area}**.")
        }
        IntentKind::Unknown => format!("Hola, soy **GestaHelp**, tu asistente de **{area}**."),
    };

    format!(
        "{intro}\n\nEstoy en fase inicial (Fase 0): el backend ya está conectado y los motores \
         (comprensión, contexto, acción, explicación y recomendación) están en construcción. \
         Para ayudarte mejor, prueba con: **\"¿cuánto vendimos hoy?\"**, **\"crea un cliente\"**, \
         **\"¿cómo funciona el cierre de caja?\"** o **\"¿qué me recomiendas?\"**."
    )
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
}
