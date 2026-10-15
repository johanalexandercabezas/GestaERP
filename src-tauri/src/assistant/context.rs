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

    pub fn display_name(&self) -> &str {
        match self.view.as_deref() {
            Some("dashboard") => "Resumen",
            Some("products") => "Productos",
            Some("pos") => "Punto de venta",
            Some("purchases") => "Compras",
            Some("cash") => "Caja",
            Some("expenses") => "Gastos",
            Some("customers") => "Clientes",
            Some("receivables") => "Cuentas por cobrar",
            Some("payables") => "Cuentas por pagar",
            Some("employees") => "Empleados",
            Some("payroll") => "Nómina",
            Some("reports") => "Reportes",
            Some("backups") => "Backups",
            Some("calendar") => "Calendario",
            Some("quotations") => "Cotizaciones",
            Some("kardex") => "Kardex",
            Some("suppliers") => "Proveedores",
            _ => "GestaERP",
        }
    }
}
