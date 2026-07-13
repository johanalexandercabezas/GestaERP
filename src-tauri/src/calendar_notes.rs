use rusqlite::{Connection, Result};
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct CalendarNote {
    pub id: i64,
    pub date: String,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub completed: bool,
    pub created_at: String,
    pub notification_date: Option<String>,
}

pub fn create_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS calendar_notes (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            date             TEXT NOT NULL,
            title            TEXT NOT NULL,
            description      TEXT NOT NULL DEFAULT '',
            priority         TEXT NOT NULL DEFAULT 'normal',
            completed        INTEGER NOT NULL DEFAULT 0,
            notification_date TEXT,
            created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );"
    )?;
    Ok(())
}

pub fn create_note(conn: &Connection, date: &str, title: &str, description: &str, priority: &str, notification_date: Option<&str>) -> Result<i64> {
    conn.execute(
        "INSERT INTO calendar_notes (date, title, description, priority, notification_date) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![date, title, description, priority, notification_date],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_notes(conn: &Connection) -> Result<Vec<CalendarNote>> {
    let mut stmt = conn.prepare(
        "SELECT id, date, title, description, priority, completed, created_at, notification_date FROM calendar_notes ORDER BY date DESC, id DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(CalendarNote {
            id: row.get(0)?,
            date: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            priority: row.get(4)?,
            completed: row.get::<_, i64>(5)? != 0,
            created_at: row.get(6)?,
            notification_date: row.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn update_note(conn: &Connection, id: i64, title: &str, description: &str, priority: &str, completed: bool, notification_date: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE calendar_notes SET title = ?1, description = ?2, priority = ?3, completed = ?4, notification_date = ?5 WHERE id = ?6",
        rusqlite::params![title, description, priority, completed as i64, notification_date, id],
    )?;
    Ok(())
}

pub fn delete_note(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM calendar_notes WHERE id = ?1", [id])?;
    Ok(())
}

/// Obtiene notas que tienen recordatorio pendiente para hoy
pub fn get_today_notifications(conn: &Connection) -> Result<Vec<CalendarNote>> {
    let mut stmt = conn.prepare(
        "SELECT id, date, title, description, priority, completed, created_at, notification_date 
         FROM calendar_notes 
         WHERE completed = 0 AND notification_date IS NOT NULL 
         AND date(notification_date) = date('now', 'localtime')
         ORDER BY notification_date"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(CalendarNote {
            id: row.get(0)?,
            date: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            priority: row.get(4)?,
            completed: row.get::<_, i64>(5)? != 0,
            created_at: row.get(6)?,
            notification_date: row.get(7)?,
        })
    })?;
    rows.collect()
}