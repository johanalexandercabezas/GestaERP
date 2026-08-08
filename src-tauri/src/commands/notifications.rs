use crate::auth_guard;
use crate::AppState;
use crate::Notification;
use tauri::State;

#[tauri::command]
pub fn get_notifications(state: State<AppState>) -> Result<Vec<Notification>, String> {
    auth_guard::require_auth(&state)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut notifications = Vec::new();

    let mut stmt = conn
        .prepare(
            "SELECT name, stock, min_stock FROM products WHERE active = 1 AND stock <= min_stock",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, f64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (name, stock, min_stock) = row.map_err(|e| e.to_string())?;
        notifications.push(Notification {
            notification_type: "stock_low".into(),
            message: format!("Stock bajo: '{}' ({}/{})", name, stock, min_stock),
            priority: "high".into(),
        });
    }

    let lic_info = crate::license::get_license_status(&conn);
    if lic_info.activated && lic_info.days_left <= 5 {
        notifications.push(Notification {
            notification_type: "license_expiring".into(),
            message: format!(
                "Licencia vence en {} días ({})",
                lic_info.days_left, lic_info.plan
            ),
            priority: "high".into(),
        });
    }

    let mut stmt = conn.prepare("SELECT customer_name, total - paid AS saldo, CAST(julianday('now') - julianday(created_at) AS INTEGER) AS days_old FROM receivables WHERE status = 'pending' AND (julianday('now') - julianday(created_at)) > 30").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (name, saldo, days_old) = row.map_err(|e| e.to_string())?;
        notifications.push(Notification {
            notification_type: "receivable_overdue".into(),
            message: format!("Vencida: {} debe ${:.0} ({} días)", name, saldo, days_old),
            priority: "medium".into(),
        });
    }

    // Calendar reminders for today
    if let Ok(reminders) = crate::calendar_notes::get_today_notifications(&conn) {
        for note in reminders {
            notifications.push(Notification {
                notification_type: "calendar_reminder".into(),
                message: format!("📅 Recordatorio: {} ({})", note.title, note.date),
                priority: "medium".into(),
            });
        }
    }

    Ok(notifications)
}
