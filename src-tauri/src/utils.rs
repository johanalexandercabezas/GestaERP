/// Convierte una cadena a f64, devolviendo un error descriptivo si falla.
pub fn parse_f64(value: &str, field: &str) -> Result<f64, String> {
    value
        .parse::<f64>()
        .map_err(|_| format!("El campo '{}' no es un número válido: {}", field, value))
}

/// Escapa un valor para ser usado en un CSV.
pub fn csv_quote(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}
