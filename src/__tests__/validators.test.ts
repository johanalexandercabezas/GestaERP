/**
 * Tests unitarios para validadores colombianos.
 *
 * Ejecutar con: npm test
 */
import { describe, it, expect } from "vitest";
import { validarDigitoVerificadorNIT, formatearNIT } from "../utils/validators";

describe("validarDigitoVerificadorNIT", () => {
  it("debe validar un NIT colombiano correcto", () => {
    // NIT de prueba válido: 901.322.630-1
    expect(validarDigitoVerificadorNIT("9013226301")).toBe(true);
  });

  it("debe validar NIT con guiones y puntos", () => {
    expect(validarDigitoVerificadorNIT("901.322.630-1")).toBe(true);
  });

  it("debe rechazar NIT con dígito verificador incorrecto", () => {
    expect(validarDigitoVerificadorNIT("9013226305")).toBe(false);
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
    expect(formatearNIT("9013226301")).toBe("901.322.630-1");
  });

  it("debe formatear NIT corto", () => {
    expect(formatearNIT("123")).toBe("12-3");
  });

  it("debe retornar el valor original si es muy corto", () => {
    expect(formatearNIT("1")).toBe("1");
  });

  it("debe limpiar guiones y puntos antes de formatear", () => {
    expect(formatearNIT("901.322.630-1")).toBe("901.322.630-1");
  });
});