//! Permisos por herramienta.
//!
//! Fase 0: define los roles válidos del sistema (fuente única para GestaHelp).
//! Fases 1+: cada herramienta registrada declara el rol mínimo que puede
//! ejecutarla, alineada con `auth_guard::require_admin` / `require_auth`.
//!
//! Regla de producto: GestaHelp nunca elude los permisos existentes; toda
//! herramienta de escritura exige el mismo rol que el comando que ejecuta.

/// Rol con privilegios plenos (coincide con `auth_guard::require_admin`).
pub const ROLE_ADMIN: &str = "admin";

/// Rol operativo de caja/POS (coincide con sesión autenticada).
#[allow(dead_code)]
pub const ROLE_CASHIER: &str = "cashier";

/// Devuelve `true` si la herramienta (por su nombre canónico) exige rol admin.
/// Alineado con el nivel del comando Tauri existente que ejecuta internamente:
///   - crear cliente (customers::create_customer) → cualquier sesión autenticada
///   - registrar gasto (expenses::create_expense) → requiere admin
pub fn tool_requires_admin(tool: &str) -> bool {
    matches!(tool, "tool_register_expense")
}
