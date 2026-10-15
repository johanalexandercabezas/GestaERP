//! Registro tipado de herramientas de negocio.
//!
//! En lugar de permitir SQL arbitrario, GestaHelp solo puede ejecutar las
//! herramientas registradas aquí. Cada herramienta delega en una función de
//! dominio Rust existente.

/// Herramientas de negocio disponibles para GestaHelp.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    GetSalesToday,
    GetExpensesToday,
    GetCashBalance,
    GetMonthlyBusiness,
    GetLowStock,
    GetTopProducts,
    GetClientesProveedores,
    GetRecentSales,
    SearchProduct,
    GetOverdueReceivables,
    CreateCustomer,
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

    pub fn navigation_target(&self) -> &'static str {
        match self {
            Tool::GetSalesToday | Tool::GetRecentSales => "pos",
            Tool::GetExpensesToday | Tool::RegisterExpense => "expenses",
            Tool::GetCashBalance => "cash",
            Tool::GetMonthlyBusiness => "dashboard",
            Tool::GetLowStock | Tool::GetTopProducts | Tool::SearchProduct => "products",
            Tool::GetClientesProveedores => "customers",
            Tool::GetOverdueReceivables => "receivables",
            Tool::CreateCustomer => "customers",
        }
    }
}

pub fn navigation_target_for_name(name: &str) -> Option<&'static str> {
    [
        Tool::GetSalesToday,
        Tool::GetExpensesToday,
        Tool::GetCashBalance,
        Tool::GetMonthlyBusiness,
        Tool::GetLowStock,
        Tool::GetTopProducts,
        Tool::GetClientesProveedores,
        Tool::GetRecentSales,
        Tool::SearchProduct,
        Tool::GetOverdueReceivables,
        Tool::CreateCustomer,
        Tool::RegisterExpense,
    ]
    .into_iter()
    .find(|tool| tool.name() == name)
    .map(|tool| tool.navigation_target())
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

    pub fn list(&self) -> &[&'static str] {
        &self.tools
    }
}
