use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use rand::seq::SliceRandom;
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

const RECOVERY_QUESTION_BANK: &[(&str, &str)] = &[
    (
        "parent_first_name",
        "¿Cuál es el primer nombre de uno de tus padres?",
    ),
    (
        "first_school",
        "¿Cómo se llamaba tu primera escuela o colegio?",
    ),
    (
        "childhood_friend",
        "¿Cuál era el nombre de un amigo de tu infancia?",
    ),
    ("first_job", "¿Cuál fue tu primer oficio o trabajo?"),
    ("birth_city", "¿En qué ciudad naciste?"),
    (
        "favorite_teacher",
        "¿Cuál era el apellido de un profesor que recuerdas?",
    ),
    (
        "childhood_street",
        "¿Cómo se llamaba la calle donde vivías de niño?",
    ),
    ("first_pet", "¿Cuál fue el nombre de tu primera mascota?"),
    (
        "favorite_book",
        "¿Cuál era el apellido del autor de un libro que te gustaba?",
    ),
];

#[derive(Serialize, Clone)]
pub struct RecoveryQuestion {
    pub id: String,
    pub prompt: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryAnswerInput {
    pub question_id: String,
    pub answer: String,
}

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

pub fn recovery_setup_questions() -> Vec<RecoveryQuestion> {
    let mut questions: Vec<RecoveryQuestion> = RECOVERY_QUESTION_BANK
        .iter()
        .map(|(id, prompt)| RecoveryQuestion {
            id: (*id).to_string(),
            prompt: (*prompt).to_string(),
        })
        .collect();
    questions.shuffle(&mut OsRng);
    questions.truncate(3);
    questions
}

pub fn recovery_questions_for_user(
    conn: &Connection,
    username: &str,
) -> std::result::Result<Vec<RecoveryQuestion>, String> {
    let mut statement = conn.prepare(
        "SELECT question_id FROM password_recovery_answers
         WHERE user_id = (SELECT id FROM users WHERE username = ?1 AND role = 'admin' AND active = 1)
         ORDER BY question_id",
    ).map_err(|error| format!("No se pudo consultar la configuración de recuperación: {error}"))?;
    let rows = statement
        .query_map([username], |row| row.get::<_, String>(0))
        .map_err(|error| format!("No se pudieron cargar las preguntas de recuperación: {error}"))?;
    let ids = rows
        .collect::<Result<Vec<_>>>()
        .map_err(|error| format!("No se pudieron leer las preguntas de recuperación: {error}"))?;
    Ok(ids
        .into_iter()
        .map(|id| {
            RECOVERY_QUESTION_BANK
                .iter()
                .find(|(question_id, _)| *question_id == id)
                .map(|(_, prompt)| RecoveryQuestion {
                    id: id.clone(),
                    prompt: (*prompt).to_string(),
                })
                .ok_or_else(|| format!("La pregunta de recuperación almacenada no es válida: {id}"))
        })
        .collect::<std::result::Result<Vec<_>, _>>()?)
}

pub fn validate_recovery_answers(
    answers: &[RecoveryAnswerInput],
) -> std::result::Result<Vec<(String, String)>, String> {
    if answers.len() != 3 {
        return Err(
            "Debes configurar y responder exactamente 3 preguntas de recuperación.".to_string(),
        );
    }
    let mut normalized = Vec::with_capacity(answers.len());
    for answer in answers {
        if !RECOVERY_QUESTION_BANK
            .iter()
            .any(|(id, _)| *id == answer.question_id)
            || normalized
                .iter()
                .any(|(id, _): &(String, String)| id == &answer.question_id)
        {
            return Err(
                "Las preguntas de recuperación no son válidas o están repetidas.".to_string(),
            );
        }
        let answer_text = normalize_recovery_answer(&answer.answer);
        if answer_text.is_empty() || answer_text.chars().count() > 120 {
            return Err("Cada respuesta debe tener entre 1 y 120 caracteres.".to_string());
        }
        normalized.push((answer.question_id.clone(), answer_text));
    }
    Ok(normalized)
}

fn normalize_recovery_answer(answer: &str) -> String {
    let normalized = answer
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    normalized
        .chars()
        .map(|character| match character {
            'á' => 'a',
            'é' => 'e',
            'í' => 'i',
            'ó' => 'o',
            'ú' | 'ü' => 'u',
            character => character,
        })
        .collect()
}

pub fn store_recovery_answers(
    conn: &Connection,
    user_id: i64,
    answers: &[(String, String)],
) -> Result<()> {
    let argon2 = Argon2::default();
    for (question_id, answer) in answers {
        let salt = SaltString::generate(&mut OsRng);
        let answer_hash = argon2
            .hash_password(answer.as_bytes(), &salt)
            .map_err(|error| {
                rusqlite::Error::InvalidParameterName(format!(
                    "No se pudo proteger una respuesta de recuperación: {error}"
                ))
            })?
            .to_string();
        conn.execute(
            "INSERT INTO password_recovery_answers (user_id, question_id, answer_hash)
             VALUES (?1, ?2, ?3)",
            rusqlite::params![user_id, question_id, answer_hash],
        )?;
    }
    Ok(())
}

pub fn verify_recovery_answers(
    conn: &Connection,
    user_id: i64,
    answers: &[(String, String)],
) -> std::result::Result<bool, String> {
    use rusqlite::OptionalExtension;

    let stored_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM password_recovery_answers WHERE user_id = ?1",
            [user_id],
            |row| row.get(0),
        )
        .map_err(|error| {
            format!("No se pudieron consultar las preguntas de recuperación: {error}")
        })?;
    if stored_count != 3 || answers.len() != 3 {
        return Ok(false);
    }

    for (question_id, answer) in answers {
        let stored_hash: Option<String> = conn
            .query_row(
                "SELECT answer_hash FROM password_recovery_answers
                 WHERE user_id = ?1 AND question_id = ?2",
                rusqlite::params![user_id, question_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("No se pudo leer una respuesta de recuperación: {error}"))?;
        let Some(stored_hash) = stored_hash else {
            return Ok(false);
        };
        let parsed_hash = PasswordHash::new(&stored_hash).map_err(|error| {
            format!("Una respuesta de recuperación almacenada no es válida: {error}")
        })?;
        if Argon2::default()
            .verify_password(answer.as_bytes(), &parsed_hash)
            .is_err()
        {
            return Ok(false);
        }
    }
    Ok(true)
}

pub fn check_recovery_lockout(conn: &Connection, user_id: i64) -> std::result::Result<(), String> {
    use rusqlite::OptionalExtension;

    let blocked_until = conn
        .query_row(
            "SELECT blocked_until FROM password_recovery_attempts WHERE user_id = ?1",
            [user_id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|error| format!("No se pudo comprobar el bloqueo de recuperación: {error}"))?
        .flatten();
    if let Some(blocked_until) = blocked_until {
        let now = chrono::Utc::now().timestamp();
        if blocked_until > now {
            return Err(format!(
                "Demasiados intentos fallidos. Vuelve a probar en {} minutos.",
                (blocked_until - now + 59) / 60
            ));
        }
    }
    Ok(())
}

pub fn record_recovery_failure(conn: &Connection, user_id: i64) -> std::result::Result<(), String> {
    use rusqlite::OptionalExtension;

    let now = chrono::Utc::now().timestamp();
    let transaction = conn
        .unchecked_transaction()
        .map_err(|error| format!("No se pudo registrar el intento de recuperación: {error}"))?;
    let current = transaction
        .query_row(
            "SELECT attempts, window_started_at, blocked_until
             FROM password_recovery_attempts WHERE user_id = ?1",
            [user_id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|error| format!("No se pudo leer el historial de recuperación: {error}"))?;
    let (attempts, window_started_at) = match current {
        Some((_, _, Some(blocked_until))) if blocked_until > now => {
            return Err("La recuperación está temporalmente bloqueada.".to_string());
        }
        Some((attempts, window_started_at, _)) if now - window_started_at < 300 => {
            (attempts + 1, window_started_at)
        }
        _ => (1, now),
    };
    let blocked_until = (attempts >= 5).then_some(now + 900);
    transaction
        .execute(
            "INSERT INTO password_recovery_attempts
                (user_id, attempts, window_started_at, blocked_until)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id) DO UPDATE SET
                attempts = excluded.attempts,
                window_started_at = excluded.window_started_at,
                blocked_until = excluded.blocked_until",
            rusqlite::params![user_id, attempts, window_started_at, blocked_until],
        )
        .map_err(|error| format!("No se pudo guardar el intento fallido: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("No se pudo confirmar el intento fallido: {error}"))
}

pub fn hash_password(password: &str) -> std::result::Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| format!("No se pudo proteger la contraseña nueva: {error}"))
}

pub fn create_user(conn: &Connection, req: &CreateUserRequest) -> Result<i64> {
    let password_hash =
        hash_password(&req.password).map_err(rusqlite::Error::InvalidParameterName)?;

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

#[cfg(test)]
mod recovery_tests {
    use super::*;

    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE password_recovery_answers (
                user_id INTEGER NOT NULL,
                question_id TEXT NOT NULL,
                answer_hash TEXT NOT NULL,
                PRIMARY KEY(user_id, question_id)
            );
            CREATE TABLE password_recovery_attempts (
                user_id INTEGER PRIMARY KEY,
                attempts INTEGER NOT NULL,
                window_started_at INTEGER NOT NULL,
                blocked_until INTEGER
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn recovery_requires_three_unique_known_questions_and_nonempty_answers() {
        let selected_questions = recovery_setup_questions();
        let unique_ids: std::collections::HashSet<_> = selected_questions
            .iter()
            .map(|question| &question.id)
            .collect();
        assert_eq!(selected_questions.len(), 3);
        assert_eq!(unique_ids.len(), 3);

        let answers = vec![
            RecoveryAnswerInput {
                question_id: "first_school".to_string(),
                answer: "  San   José ".to_string(),
            },
            RecoveryAnswerInput {
                question_id: "first_pet".to_string(),
                answer: "Luna".to_string(),
            },
            RecoveryAnswerInput {
                question_id: "birth_city".to_string(),
                answer: "Bogotá".to_string(),
            },
        ];
        let normalized = validate_recovery_answers(&answers).unwrap();
        assert_eq!(normalized[0].1, "san jose");
        assert!(validate_recovery_answers(&answers[..2]).is_err());
        assert!(validate_recovery_answers(&[
            RecoveryAnswerInput {
                question_id: "first_school".to_string(),
                answer: "Colegio".to_string(),
            },
            RecoveryAnswerInput {
                question_id: "first_school".to_string(),
                answer: "Escuela".to_string(),
            },
            RecoveryAnswerInput {
                question_id: "birth_city".to_string(),
                answer: "Medellín".to_string(),
            },
        ])
        .is_err());
    }

    #[test]
    fn recovery_answers_are_salted_hashes_and_all_must_match() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO users (id, username, password, full_name, role)
             VALUES (1, 'admin', 'unused', 'Administrador', 'admin')",
            [],
        )
        .unwrap();
        let answers = validate_recovery_answers(&[
            RecoveryAnswerInput {
                question_id: "first_school".to_string(),
                answer: "San José".to_string(),
            },
            RecoveryAnswerInput {
                question_id: "first_pet".to_string(),
                answer: "Luna".to_string(),
            },
            RecoveryAnswerInput {
                question_id: "birth_city".to_string(),
                answer: "Bogotá".to_string(),
            },
        ])
        .unwrap();
        store_recovery_answers(&conn, 1, &answers).unwrap();

        let stored_hash: String = conn
            .query_row(
                "SELECT answer_hash FROM password_recovery_answers
                 WHERE user_id = 1 AND question_id = 'first_school'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_ne!(stored_hash, answers[0].1);
        assert!(verify_recovery_answers(&conn, 1, &answers).unwrap());

        let wrong_answers = validate_recovery_answers(&[
            RecoveryAnswerInput {
                question_id: "first_school".to_string(),
                answer: "Otra escuela".to_string(),
            },
            RecoveryAnswerInput {
                question_id: "first_pet".to_string(),
                answer: "Luna".to_string(),
            },
            RecoveryAnswerInput {
                question_id: "birth_city".to_string(),
                answer: "Bogotá".to_string(),
            },
        ])
        .unwrap();
        assert!(!verify_recovery_answers(&conn, 1, &wrong_answers).unwrap());
    }

    #[test]
    fn failed_recovery_attempts_lock_persistently() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO users (id, username, password, full_name, role)
             VALUES (1, 'admin', 'unused', 'Administrador', 'admin')",
            [],
        )
        .unwrap();
        for _ in 0..5 {
            record_recovery_failure(&conn, 1).unwrap();
        }
        assert!(check_recovery_lockout(&conn, 1).is_err());
    }
}
