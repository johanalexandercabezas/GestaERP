//! Comando principal de GestaHelp.
//!
//! Punto de entrada desde el frontend. Recibe el mensaje del usuario y el
//! contexto (vista activa) y delega en el dominio `crate::assistant`. Nunca
//! accede a SQLite directamente desde aquí: toda acción pasa por los motores
//! y (en fases futuras) por las herramientas tipadas sobre funciones de dominio.

use crate::assistant::planner::GestaHelpPlan;
use crate::assistant::{
    context::Context, executor, intent_engine, knowledge, planner, recommendations,
};
use crate::auth_guard;
use crate::AppState;
use serde::Serialize;
use tauri::State;

/// Respuesta estructurada que el backend devuelve al chat.
#[derive(Serialize)]
pub struct GestaHelpReply {
    /// Texto preparado para mostrar al usuario.
    pub reply: String,
    /// Intención detectada (Consult | Create | Explain | Analyze | Unknown | Execute).
    pub intent: String,
    /// `true` si la intención modifica datos y debe confirmarse antes de ejecutar.
    pub requires_confirmation: bool,
    /// `true` si la intención ya se ejecutó contra el backend.
    pub executed: bool,
    /// Herramienta(s) usada(s) o disponibles para la consulta.
    pub tools: Vec<String>,
    /// Plan de acción pendiente de confirmación (presente si `requires_confirmation`).
    pub plan: Option<GestaHelpPlan>,
}

/// Comando `chat` de GestaHelp.
///
/// - `message`: texto libre del usuario.
/// - `current_view`: módulo activo en el frontend (App.tsx `currentView`) para el Motor 2.
#[tauri::command]
#[allow(unused_mut)]
pub fn chat(
    state: State<AppState>,
    message: String,
    current_view: Option<String>,
) -> Result<GestaHelpReply, String> {
    // GestaHelp exige sesión autenticada (mismas reglas que el resto del ERP).
    auth_guard::require_auth(&state)?;

    // Motor 2: contexto de navegación del usuario.
    let ctx = Context::new(current_view);

    // Motor 1: clasificar la intención.
    let kind = intent_engine::default_engine().analyze_intent(&message);

    let mut tools: Vec<String> = Vec::new();
    let mut plan: Option<GestaHelpPlan> = None;
    let mut reply: String;
    let mut executed = false;
    let requires_confirmation = kind == intent_engine::IntentKind::Create;

    if requires_confirmation {
        // Motor 3: generar el plan (resumen) para que el usuario confirme.
        match planner::plan_create(&message) {
            Some(p) => {
                tools.push(p.tool.clone());
                plan = Some(p.clone());
                reply = format!("{}\n\n¿**Deseas continuar**?", p.summary);
            }
            None => {
                reply = intent_engine::build_reply(&message, kind, &ctx);
            }
        }
    } else if kind == intent_engine::IntentKind::Explain {
        // Motor 4: explicación basada en la base de conocimiento (no toca datos).
        reply = match knowledge::explain(&message) {
            Some(a) => a,
            None => knowledge::hint(),
        };
    } else if kind == intent_engine::IntentKind::Analyze {
        // Motor 5: recomendaciones proactivas sobre el estado del negocio.
        match recommendations::analyze(&state) {
            Ok(text) => {
                reply = text;
                executed = true;
            }
            Err(e) => reply = format!("⚠️ No pude analizar el negocio: {e}"),
        }
    } else {
        // Consulta/análisis: Motor 3 elige herramienta y el ejecutor la corre ya.
        match planner::select_tool(&message, kind, &ctx) {
            Some(tool) => {
                tools.push(tool.name().to_string());
                match executor::execute_consult(&state, tool, &message) {
                    Ok(r) => {
                        reply = r;
                        executed = true;
                    }
                    Err(e) => {
                        reply = format!("⚠️ No pude completar la consulta: {e}");
                    }
                }
            }
            None => {
                // Explicación / desconocido: respuesta guiada sin ejecutar nada.
                reply = intent_engine::build_reply(&message, kind, &ctx);
            }
        }
    }

    Ok(GestaHelpReply {
        reply,
        intent: format!("{:?}", kind),
        requires_confirmation,
        executed,
        tools,
        plan,
    })
}

/// Comando `execute` de GestaHelp: ejecuta un plan previamente confirmado.
/// Requiere sesión autenticada; valida permisos y registra la acción en auditoría.
#[tauri::command]
pub fn execute(state: State<AppState>, plan: GestaHelpPlan) -> Result<GestaHelpReply, String> {
    auth_guard::require_auth(&state)?;
    let user = auth_guard::current_user(&state)?;

    let reply = executor::execute_write(&state, &plan, user.id, &user.full_name, &user.role)?;

    Ok(GestaHelpReply {
        reply,
        intent: "Execute".to_string(),
        requires_confirmation: false,
        executed: true,
        tools: vec![plan.tool.clone()],
        plan: None,
    })
}
