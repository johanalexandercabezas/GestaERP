/**
 * Utilidad para transformar textos a MAYÚSCULAS de forma consistente en toda la app.
 * Se aplica en todos los inputs de texto para estandarizar.
 */

/**
 * Convierte un string a mayúsculas, manejando null/undefined.
 */
export function toUpper(value: string | null | undefined): string {
  if (!value) return "";
  return value.toUpperCase();
}


/**
 * Filtro solo números para campos como teléfono, cuenta bancaria, NIT.
 */
export function onlyNumbers(value: string): string {
  return value.replace(/\D/g, "");
}