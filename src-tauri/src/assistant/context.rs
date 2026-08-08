//! Motor 2 — Contexto.
//!
//! Entiende DÓNDE está el usuario dentro del ERP. El frontend (App.tsx) informa
//! la vista/módulo activo (`currentView`) como parámetro del comando `chat`.
//! Con esto, una consulta ambigua como "¿quién lo compra más?" se resuelve
//! contra el módulo y la entidad en foco (p. ej. el producto abierto), no de
//! forma genérica.

/// Contexto de navegación del usuario en el momento del mensaje.
#[derive(Debug, Clone)]
pub struct Context {
    /// Módulo/vista activo en el frontend (p. ej. "products", "pos", "cash").
    pub view: Option<String>,
}

impl Context {
    pub fn new(view: Option<String>) -> Self {
        Context { view }
    }
}
