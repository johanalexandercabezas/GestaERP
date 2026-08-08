//! Dominio GestaHelp — Asistente digital del ERP.
//!
//! Principios invariables (aplican desde la Fase 0):
//! - NUNCA genera ni ejecuta SQL dinámico. Cero SQL creado por el asistente.
//! - Toda acción termina en una función de dominio Rust existente
//!   (`crate::sales`, `crate::customers`, `crate::products`, ...) sin duplicar
//!   lógica ni validaciones.
//! - Flujo: Frontend → command `gestahelp::chat` → intent_engine → planner /
//!   executor → servicios Rust → SQLite.
//! - El LLM es un componente REEMPLAZABLE: hoy hay un RuleEngine (motores en
//!   reglas); mañana un modelo local (Gemma/Qwen/Phi) o un proveedor — sin
//!   reescribir la arquitectura, vía la misma interfaz.
//!
//! Estructura (visión del producto):
//!   intent_engine   → Motor 1 · Comprensión (qué quiere el usuario)
//!   context         → Motor 2 · Contexto (en qué módulo está el usuario)
//!   planner         → Motor 3 · Plan (genera resumen + confirmación, no ejecuta)
//!   executor        → Motor 3 · Ejecución (ejecuta tools confirmadas + auditoría)
//!   knowledge       → Motor 4 · Explicación (base de conocimiento de GestaERP)
//!   recommendations → Motor 5 · Recomendaciones (análisis del negocio)
//!   tool_registry   → Registro tipado de herramientas de negocio
//!   permissions     → Mapeo tool → rol requerido (admin/cashier)

pub mod context;
pub mod executor;
pub mod intent_engine;
pub mod knowledge;
pub mod permissions;
pub mod planner;
pub mod recommendations;
pub mod tool_registry;
