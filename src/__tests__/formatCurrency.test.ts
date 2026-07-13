/**
 * Tests unitarios para formateo de moneda colombiana.
 *
 * Ejecutar con: npx vitest run
 */
import { describe, it, expect, beforeEach } from "vitest";
import { formatCOP, formatCOPDecimals } from "../utils/formatCurrency";

describe("formatCOP", () => {
  it("debe formatear enteros sin decimales", () => {
    const result = formatCOP(1234567);
    expect(result).toContain("$");
    expect(result).toContain("1.234.567");
    expect(result).not.toContain(",");
  });

  it("debe formatear cero", () => {
    const result = formatCOP(0);
    expect(result).toContain("$");
    expect(result).toContain("0");
  });

  it("debe formatear valores negativos", () => {
    const result = formatCOP(-50000);
    expect(result).toContain("$");
    expect(result).toContain("50.000");
  });

  it("debe redondear decimales", () => {
    const result = formatCOP(1234.56);
    expect(result).toContain("1.235");
  });
});

describe("formatCOPDecimals", () => {
  it("debe formatear con 2 decimales", () => {
    const result = formatCOPDecimals(1234567.89);
    expect(result).toContain("$");
    expect(result).toContain("1.234.567");
    expect(result).toContain(",89");
  });

  it("debe formatear entero con decimales .00", () => {
    const result = formatCOPDecimals(5000);
    expect(result).toContain(",00");
  });

  it("debe redondear a 2 decimales", () => {
    const result = formatCOPDecimals(100.999);
    expect(result).toContain(",00"); // Intl redondea 100.999 → 101.00
  });
});