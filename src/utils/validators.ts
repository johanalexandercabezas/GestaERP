/**
 * Valida el dígito verificador de un NIT colombiano usando el algoritmo de módulo 11.
 * @param nit - El NIT sin puntos ni comas (ej: "9013226301")
 * @returns true si el dígito verificador es correcto
 */
export function validarDigitoVerificadorNIT(nit: string): boolean {
  // Eliminar espacios, guiones y puntos
  const nitLimpio = nit.replace(/[\s\-\.]/g, "");
  
  // El NIT debe tener al menos 2 dígitos (número + dígito verificador)
  if (nitLimpio.length < 2 || !/^\d+$/.test(nitLimpio)) {
    return false;
  }

  const digitoVerificador = nitLimpio.charAt(nitLimpio.length - 1).toUpperCase();
  const numeroBase = nitLimpio.slice(0, -1);

  // FIX: Los multiplicadores del NIT colombiano se aplican de IZQUIERDA a DERECHA
  // (no de derecha a izquierda como estaba antes). Esto causaba que NITs válidos
  // como 901322630-1 fallaran la validación.
  const multiplicadores = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
  let suma = 0;

  for (let i = 0; i < numeroBase.length; i++) {
    const digito = parseInt(numeroBase.charAt(i), 10);
    suma += digito * multiplicadores[i % multiplicadores.length];
  }

  const residuo = suma % 11;
  let digitoCalculado: string;

  if (residuo === 0 || residuo === 1) {
    digitoCalculado = residuo.toString();
  } else {
    digitoCalculado = (11 - residuo).toString();
  }

  return digitoCalculado === digitoVerificador;
}

/**
 * Formatea un NIT con puntos y guión para mostrar.
 * Ejemplo: "9013226301" → "901.322.630-1"
 */
export function formatearNIT(nit: string): string {
  const nitLimpio = nit.replace(/[\s\-\.]/g, "");
  if (nitLimpio.length < 2) return nit;
  
  const digito = nitLimpio.charAt(nitLimpio.length - 1);
  const numero = nitLimpio.slice(0, -1);
  
  // Formatear con puntos cada 3 dígitos de derecha a izquierda
  const numeroFormateado = numero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  
  return `${numeroFormateado}-${digito}`;
}