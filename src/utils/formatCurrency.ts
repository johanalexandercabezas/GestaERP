/**
 * Formatea un número como moneda colombiana (COP) sin decimales.
 * Ejemplo: 1234567 → "$1.234.567"
 */
export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Formatea un número como moneda colombiana (COP) con 2 decimales.
 * Ejemplo: 1234567.89 → "$1.234.567,89"
 */
export function formatCOPDecimals(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
