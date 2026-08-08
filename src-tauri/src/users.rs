use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Debug, Clone)]
pub struct UserRecord {
    pub id: i64,
    pub username: String,
    pub full_name: String,
    pub role: String,
    pub active: bool,
}

#[derive(Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub full_name: String,
    pub role: String,
}

#[derive(Deserialize)]
pub struct UpdateUserRequest {
    pub id: i64,
    pub full_name: String,
    pub role: String,
    pub active: bool,
    pub new_password: Option<String>,
}

pub fn create_user(conn: &Connection, req: &CreateUserRequest) -> Result<i64> {
    let argon2 = Argon2::default();
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = argon2
        .hash_password(req.password.as_bytes(), &salt)
        .map_err(|e| rusqlite::Error::InvalidParameterName(format!("Error al hashear: {}", e)))?
        .to_string();

    conn.execute(
        "INSERT INTO users (username, password, full_name, role) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![req.username, password_hash, req.full_name, req.role],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_users(conn: &Connection) -> Result<Vec<UserRecord>> {
    let mut stmt =
        conn.prepare("SELECT id, username, full_name, role, active FROM users ORDER BY id")?;
    let rows = stmt.query_map([], |row| {
        Ok(UserRecord {
            id: row.get(0)?,
            username: row.get(1)?,
            full_name: row.get(2)?,
            role: row.get(3)?,
            active: row.get::<_, i64>(4)? != 0,
        })
    })?;
    rows.collect()
}

pub fn update_user(conn: &Connection, req: &UpdateUserRequest) -> Result<()> {
    if let Some(new_pass) = &req.new_password {
        if !new_pass.is_empty() {
            let argon2 = Argon2::default();
            let salt = SaltString::generate(&mut OsRng);
            let password_hash = argon2
                .hash_password(new_pass.as_bytes(), &salt)
                .map_err(|e| {
                    rusqlite::Error::InvalidParameterName(format!("Error al hashear: {}", e))
                })?
                .to_string();
            conn.execute(
                "UPDATE users SET full_name=?1, role=?2, active=?3, password=?4 WHERE id=?5",
                rusqlite::params![
                    req.full_name,
                    req.role,
                    req.active as i64,
                    password_hash,
                    req.id
                ],
            )?;
        } else {
            conn.execute(
                "UPDATE users SET full_name=?1, role=?2, active=?3 WHERE id=?4",
                rusqlite::params![req.full_name, req.role, req.active as i64, req.id],
            )?;
        }
    } else {
        conn.execute(
            "UPDATE users SET full_name=?1, role=?2, active=?3 WHERE id=?4",
            rusqlite::params![req.full_name, req.role, req.active as i64, req.id],
        )?;
    }
    Ok(())
}

pub fn delete_user(conn: &Connection, id: i64) -> Result<()> {
    // Evitar eliminar el último admin
    let admin_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1",
        [],
        |row| row.get(0),
    )?;
    let is_admin: bool = conn
        .query_row(
            "SELECT role = 'admin' FROM users WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if is_admin && admin_count <= 1 {
        return Err(rusqlite::Error::InvalidParameterName(
            "No se puede eliminar el último administrador.".to_string(),
        ));
    }

    conn.execute("DELETE FROM users WHERE id=?1", [id])?;
    Ok(())
}
