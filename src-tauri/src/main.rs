#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod assistant;
mod audit;
mod auth_guard;
mod backup;
mod calendar_notes;
mod cash_register;
mod commands;
mod config;
mod crypto;
mod customers;
mod db;
mod expenses;
mod implementation;
mod license;
mod payroll;
mod payroll_reports;
mod physical_inventory;
mod products;
mod purchases;
mod rate_limiter;
mod receivables;
mod reports;
mod sales;
mod suppliers;
mod transaction;
mod users;
mod utils;
mod validation;

use rusqlite::Connection;
use serde::Deserialize;
use serde::Serialize;
use std::ops::{Deref, DerefMut};
use std::sync::{Mutex, MutexGuard};
use tauri::State;

#[derive(Serialize)]
pub struct AppInfo {
    version: String,
    backend: String,
    timestamp: String,
}

#[derive(Serialize, Clone)]
pub struct UserInfo {
    id: i64,
    full_name: String,
    role: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    success: bool,
    user: Option<UserInfo>,
    message: String,
}

#[derive(Serialize)]
pub struct Notification {
    #[serde(rename = "type")]
    notification_type: String,
    message: String,
    priority: String,
}

pub struct AppState {
    db: DatabaseHandle,
    current_user: Mutex<Option<UserInfo>>,
}

pub struct DatabaseHandle {
    connection: Mutex<Option<Connection>>,
}

pub struct DatabaseGuard<'a>(MutexGuard<'a, Option<Connection>>);

impl DatabaseHandle {
    fn new(connection: Option<Connection>) -> Self {
        Self {
            connection: Mutex::new(connection),
        }
    }

    fn lock(&self) -> Result<DatabaseGuard<'_>, String> {
        let guard = self
            .connection
            .lock()
            .map_err(|error| format!("Error al bloquear la base de datos: {}", error))?;
        if guard.is_none() {
            return Err(
                "La base de datos está bloqueada; completa la recuperación para continuar."
                    .to_string(),
            );
        }
        Ok(DatabaseGuard(guard))
    }

    fn initialize(&self, connection: Connection) -> Result<(), String> {
        let mut guard = self
            .connection
            .lock()
            .map_err(|error| format!("Error al bloquear la base de datos: {}", error))?;
        if guard.is_some() {
            return Err("La base de datos ya está abierta.".to_string());
        }
        *guard = Some(connection);
        Ok(())
    }

    fn is_initialized(&self) -> Result<bool, String> {
        self.connection
            .lock()
            .map(|connection| connection.is_some())
            .map_err(|error| format!("Error al consultar la base de datos: {}", error))
    }
}

impl Deref for DatabaseGuard<'_> {
    type Target = Connection;

    fn deref(&self) -> &Self::Target {
        self.0
            .as_ref()
            .expect("DatabaseGuard only exists for an initialized database")
    }
}

impl DerefMut for DatabaseGuard<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.0
            .as_mut()
            .expect("DatabaseGuard only exists for an initialized database")
    }
}

#[derive(Deserialize)]
struct TicketItem {
    name: String,
    quantity: f64,
    unit_price: f64,
    subtotal: f64,
}

/// Formatea un número como moneda colombiana en el formato HTML (usando JS Intl)
fn format_cop_html(value: f64) -> String {
    // Para mostrar en el ticket usamos el formato con separadores de miles
    let abs_val = value.abs();
    let int_part = abs_val.trunc() as u64;
    let dec_part = ((abs_val - abs_val.trunc()) * 100.0) as u64;

    // Formatear parte entera con separadores de miles
    let int_str = int_part.to_string();
    let mut result = String::new();
    let mut count = 0;
    for ch in int_str.chars().rev() {
        if count > 0 && count % 3 == 0 {
            result.push('.');
        }
        result.push(ch);
        count += 1;
    }
    let formatted_int: String = result.chars().rev().collect();

    if value < 0.0 {
        format!("-${}.{:02}", formatted_int, dec_part)
    } else {
        format!("${}.{:02}", formatted_int, dec_part)
    }
}

/// Traduce método de pago
fn translate_payment_method(method: &str) -> &str {
    match method {
        "cash" => "Efectivo",
        "card" => "Tarjeta",
        "transfer" => "Transferencia",
        "credit" => "Crédito",
        _ => method,
    }
}

#[tauri::command]
fn print_ticket(
    state: State<AppState>,
    business_name: String,
    items: Vec<TicketItem>,
    total: f64,
    payment_method: String,
    cash_received: Option<f64>,
    change: Option<f64>,
) -> Result<String, String> {
    // CORRECCIÓN C4: Requerir sesión activa para imprimir tickets
    crate::auth_guard::require_auth(&state)?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let filename_now = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let payment_label = translate_payment_method(&payment_method);

    let mut items_html = String::new();
    for item in &items {
        items_html.push_str(&format!(
            "<tr><td>{}</td><td align='right'>{}</td><td align='right'>{}</td><td align='right'>{}</td></tr>",
            item.name,
            item.quantity,
            format_cop_html(item.unit_price),
            format_cop_html(item.subtotal)
        ));
    }

    let change_html = if let Some(c) = change {
        format!(
            "<tr><td colspan='3'><b>Cambio</b></td><td align='right'>{}</td></tr>",
            format_cop_html(c)
        )
    } else {
        String::new()
    };

    let cr_html = if let Some(cr) = cash_received {
        format!(
            "<tr><td colspan='3'><b>Efectivo recibido</b></td><td align='right'>{}</td></tr>",
            format_cop_html(cr)
        )
    } else {
        String::new()
    };

    let html = format!(
        r#"<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Ticket {filename_now}</title><style>
        *{{margin:0;padding:0;box-sizing:border-box;}}
        body{{font-family:'Courier New',Courier,monospace;font-size:12px;margin:0;padding:20px;color:#000;width:80mm;}}
        .center{{text-align:center;margin-bottom:4px;}}
        .header{{font-size:14px;font-weight:bold;margin-bottom:2px;}}
        .subheader{{font-size:10px;color:#333;}}
        table{{width:100%;border-collapse:collapse;margin:6px 0;}}
        th{{padding:2px 0;border-bottom:1px dashed #000;font-size:10px;text-transform:uppercase;}}
        td{{padding:1px 0;font-size:11px;vertical-align:top;}}
        .line{{border-top:1px dashed #000;margin:6px 0;}}
        .total-row td{{font-weight:bold;font-size:13px;padding-top:4px;}}
        .footer{{text-align:center;margin-top:10px;font-size:10px;color:#333;}}
        .payment-info td{{padding:1px 0;font-size:11px;}}
        .right{{text-align:right;}}
        .left{{text-align:left;}}
    </style></head><body>
        <div class="center header">{business_name}</div>
        <div class="center subheader">Nit: ---</div>
        <div class="center subheader">{now}</div>
        <div class="line"></div>
        <table>
            <tr><th class="left">Producto</th><th class="right">Cant.</th><th class="right">Precio</th><th class="right">Subtotal</th></tr>
            {items_html}
        </table>
        <div class="line"></div>
        <table>
            <tr class="total-row"><td colspan="3" class="left">TOTAL</td><td class="right">{total_formatted}</td></tr>
            <tr class="payment-info"><td colspan="3" class="left">Método de pago</td><td class="right">{payment_label}</td></tr>
            {cr_html}{change_html}
        </table>
        <div class="line"></div>
        <div class="footer">
            ¡Gracias por su compra!<br/>
            GestaERP - GestaSoftTech<br/>
            www.fundasopaco.org
        </div>
    </body></html>"#,
        total_formatted = format_cop_html(total)
    );

    let data_dir = dirs::data_dir().ok_or("No se encontró el directorio de datos del sistema")?;
    let dir = data_dir.join("GestaERP").join("tickets");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Error al crear carpeta tickets: {}", e))?;
    let filename = format!("ticket_{}.html", filename_now);
    let path = dir.join(&filename);
    std::fs::write(&path, html).map_err(|e| format!("Error al guardar ticket: {}", e))?;
    Ok(format!("Ticket guardado en {}", path.display()))
}

fn main() {
    // Inicializar configuración (carga .env, variables de entorno)
    config::init();

    // AUD-012: Recordar configurar la clave pública del updater antes del release.
    // Si se usa el placeholder "REEMPLAZAR_CON_CLAVE_PUBLICA_TAURI", las firmas
    // de actualización no se validarán. Generar con: cargo tauri signer generate
    #[cfg(not(debug_assertions))]
    log::warn!("[UPDATER] Verifica que tauri.conf.json tiene la clave pública real del updater.");

    let conn = match db::open_from_keyring() {
        Ok(connection) => connection,
        Err(error) => {
            log::error!(
                "No se pudo abrir la base de datos automáticamente: {}",
                error
            );
            None
        }
    };
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            db: DatabaseHandle::new(conn),
            current_user: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_database_security_state,
            commands::settings::initialize_database_security,
            commands::settings::recover_database_key,
            commands::settings::configure_backup_sync,
            commands::auth::login,
            commands::auth::get_current_user,
            commands::auth::logout,
            commands::dashboard::get_dashboard_data,
            commands::products::create_product,
            commands::products::list_products,
            commands::products::list_products_page,
            commands::products::update_product,
            commands::products::delete_product,
            commands::products::search_products,
            commands::products::check_duplicates,
            commands::products::find_product_by_sku,
            commands::products::list_services,
            commands::products::list_active_services,
            commands::products::update_service,
            commands::sales::create_sale_v2,
            commands::sales::get_recent_sales,
            commands::purchases::check_invoice_duplicate,
            commands::purchases::create_purchase,
            commands::purchases::get_recent_purchases,
            commands::quotations::create_quotation,
            commands::quotations::list_quotations,
            commands::quotations::get_quotation,
            commands::quotations::update_quotation_status,
            commands::quotations::delete_quotation,
            commands::quotations::convert_quotation_to_sale,
            commands::payables::create_payable,
            commands::payables::list_payables,
            commands::payables::get_payable,
            commands::payables::register_payable_payment,
            commands::payables::list_payable_payments,
            commands::payables::get_payables_summary,
            commands::suppliers::create_supplier,
            commands::suppliers::list_suppliers,
            commands::suppliers::update_supplier,
            commands::suppliers::delete_supplier,
            commands::cash::open_cash_register,
            commands::cash::close_cash_register,
            commands::cash::get_open_register,
            commands::cash::get_recent_registers,
            commands::backups::create_backup,
            commands::backups::list_backups,
            commands::backups::restore_backup,
            commands::backups::delete_backup,
            commands::backups::export_backup,
            commands::backups::import_backup,
            commands::backups::open_backups_folder,
            commands::backups::get_backup_sync_status,
            commands::backups::sync_backups,
            commands::backups::list_remote_backups,
            commands::backups::download_remote_backup,
            print_ticket,
            commands::customers::create_customer,
            commands::customers::list_customers,
            commands::customers::update_customer,
            commands::customers::delete_customer,
            commands::reports::generate_sales_report,
            commands::reports::export_report_to_csv,
            commands::users::create_bootstrap_admin,
            commands::users::create_user,
            commands::users::list_users,
            commands::users::update_user,
            commands::users::delete_user,
            commands::users::has_any_user,
            commands::expenses::create_expense,
            commands::expenses::list_expenses,
            commands::receivables::list_receivables,
            commands::receivables::register_payment,
            commands::employees::create_employee,
            commands::employees::list_employees,
            commands::employees::update_employee,
            commands::employees::delete_employee,
            commands::payroll::generate_payroll,
            commands::payroll::get_payroll_history,
            commands::payroll::get_benefit_load,
            commands::payroll::generate_payroll_report,
            commands::licenses::activate_license,
            commands::licenses::activate_trial,
            commands::licenses::get_license_status,
            commands::notifications::get_notifications,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::is_setup_complete,
            commands::settings::save_business_info,
            commands::settings::upload_business_logo,
            commands::settings::get_business_logo,
            commands::settings::get_desktop_path,
            commands::settings::reset_database,
            commands::inventory::create_physical_count,
            commands::inventory::update_counted_qty,
            commands::inventory::list_physical_counts,
            commands::inventory::get_physical_count,
            commands::inventory::apply_adjustments,
            commands::inventory::update_count_status,
            commands::inventory::get_inventory_audit_summary,
            commands::inventory::generate_stock_validation_report,
            commands::kardex::get_inventory_movements,
            commands::kardex::get_product_kardex,
            commands::kardex::export_kardex_csv,
            commands::audit::get_audit_logs,
            commands::audit::get_audit_summary,
            commands::audit::export_audit_logs_csv,
            commands::accounting::create_accounting_closure,
            commands::accounting::list_accounting_closures,
            commands::accounting::get_accounting_summary,
            commands::calendar::create_calendar_note,
            commands::calendar::list_calendar_notes,
            commands::calendar::update_calendar_note,
            commands::calendar::delete_calendar_note,
            commands::info::get_app_info,
            commands::info::is_db_ready,
            commands::updates::apply_update,
            commands::updates::get_app_version,
            commands::gestahelp::chat,
            commands::gestahelp::execute,
            commands::licenses::generate_implementation_code,
            commands::licenses::validate_implementation_code,
            commands::licenses::get_implementation_status,
            commands::licenses::is_implementation_paid,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar GestaERP");
}
