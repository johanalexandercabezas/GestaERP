//! Registro tipado de herramientas de negocio.
//!
//! En lugar de permitir SQL arbitrario, GestaHelp solo puede ejecutar las
//! herramientas registradas aquí. Cada herramienta es una cáscara que delega en
//! una función de dominio Rust existente (nunca genera SQL).
//!
//! Fase 1: herramientas de SOLO LECTURA (consulta/análisis). Fase 2+ añade
//! herramientas de escritura que pasan por confirmación (`planner`/`executor`).

/// Herramientas de negocio disponibles para GestaHelp.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    /// Ventas del día de hoy.
    GetSalesToday,
    /// Gastos del día de hoy.
    GetExpensesToday,
    /// Saldo actual de caja.
    GetCashBalance,
    /// Resumen general del negocio (mes en curso).
    GetMonthlyBusiness,
    /// Productos por debajo del stock mínimo.
    GetLowStock,
    /// Top productos más vendidos del mes.
    GetTopProducts,
    /// Cantidad de clientes y proveedores.
    GetClientesProveedores,
    /// Listado de ventas recientes.
    GetRecentSales,
    /// Búsqueda de producto por nombre/SKU.
    SearchProduct,
    /// Cuentas por cobrar con saldo pendiente.
    GetOverdueReceivables,
    /// Crear un cliente (escritura — requiere confirmación).
    CreateCustomer,
    /// Registrar un gasto (escritura — requiere confirmación).
    RegisterExpense,
}

impl Tool {
    /// Nombre canónico (snake_case) para identificar la herramienta.
    pub fn name(&self) -> &'static str {
        match self {
            Tool::GetSalesToday => "tool_get_sales_today",
            Tool::GetExpensesToday => "tool_get_expenses_today",
            Tool::GetCashBalance => "tool_get_cash_balance",
            Tool::GetMonthlyBusiness => "tool_get_monthly_business",
            Tool::GetLowStock => "tool_get_low_stock",
            Tool::GetTopProducts => "tool_get_top_products",
            Tool::GetClientesProveedores => "tool_get_clientes_proveedores",
            Tool::GetRecentSales => "tool_get_recent_sales",
            Tool::SearchProduct => "tool_search_product",
            Tool::GetOverdueReceivables => "tool_get_overdue_receivables",
            Tool::CreateCustomer => "tool_create_customer",
            Tool::RegisterExpense => "tool_register_expense",
        }
    }
}

/// Colección de herramientas disponibles (consulta para informes/UI).
#[allow(dead_code)]
pub struct ToolRegistry {
    tools: Vec<&'static str>,
}

#[allow(dead_code)]
impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(dead_code)]
impl ToolRegistry {
    pub fn new() -> Self {
        ToolRegistry {
            tools: vec![
                Tool::GetSalesToday.name(),
                Tool::GetExpensesToday.name(),
                Tool::GetCashBalance.name(),
                Tool::GetMonthlyBusiness.name(),
                Tool::GetLowStock.name(),
                Tool::GetTopProducts.name(),
                Tool::GetClientesProveedores.name(),
                Tool::GetRecentSales.name(),
                Tool::SearchProduct.name(),
                Tool::GetOverdueReceivables.name(),
                Tool::CreateCustomer.name(),
                Tool::RegisterExpense.name(),
            ],
        }
    }

    /// Lista todas las herramientas registradas.
    pub fn list(&self) -> &[&'static str] {
        &self.tools
    }
}
