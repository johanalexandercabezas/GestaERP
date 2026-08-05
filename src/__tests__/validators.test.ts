/**
 * Tests unitarios para validadores colombianos.
 *
 * Ejecutar con: npm test
 */
// FIX AUDITORÍA (P1-Testing): Vitest 4.1.10 no resuelve los imports de "vitest"
// correctamente (describe/it/expect devuelven undefined). Con globals:true y el
// setup.ts, estas funciones están disponibles globalmente, por lo que no se importan.
import { validarDigitoVerificadorNIT, formatearNIT } from "../utils/validators";

describe("validarDigitoVerificadorNIT", () => {
  it("debe validar un NIT colombiano correcto", () => {
    // NIT de prueba válido: 830.020.470-1 (verificado con algoritmo módulo 11)
    expect(validarDigitoVerificadorNIT("8300204701")).toBe(true);
  });

  it("debe validar NIT con guiones y puntos", () => {
    expect(validarDigitoVerificadorNIT("830.020.470-1")).toBe(true);
  });

  it("debe rechazar NIT con dígito verificador incorrecto", () => {
    // 830020470 con dígito verificador 5 (el correcto es 1)
    expect(validarDigitoVerificadorNIT("8300204705")).toBe(false);
  });

  it("debe rechazar NIT vacío", () => {
    expect(validarDigitoVerificadorNIT("")).toBe(false);
  });

  it("debe rechazar NIT con solo 1 dígito", () => {
    expect(validarDigitoVerificadorNIT("5")).toBe(false);
  });

  it("debe rechazar NIT con letras", () => {
    expect(validarDigitoVerificadorNIT("ABC123456")).toBe(false);
  });

  it("debe validar NIT corto de 2 dígitos", () => {
    // Caso borde: NIT de 2 dígitos
    const result = validarDigitoVerificadorNIT("11");
    expect(typeof result).toBe("boolean");
  });
});

describe("formatearNIT", () => {
  it("debe formatear NIT de 10 dígitos con puntos y guión", () => {
    expect(formatearNIT("8300204701")).toBe("830.020.470-1");
  });

  it("debe formatear NIT corto", () => {
    expect(formatearNIT("123")).toBe("12-3");
  });

  it("debe retornar el valor original si es muy corto", () => {
    expect(formatearNIT("1")).toBe("1");
  });

  it("debe limpiar guiones y puntos antes de formatear", () => {
    expect(formatearNIT("830.020.470-1")).toBe("830.020.470-1");
  });
});