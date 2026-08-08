import { describe, it, expect } from 'vitest';
import { formatCOP, formatPercent, formatNumber } from '../utils/format';

describe('formatCOP', () => {
  it('debe formatear montos en pesos colombianos', () => {
    const result = formatCOP(1000000);
    expect(result).toContain('1.000.000');
  });

  it('debe manejar cero', () => {
    const result = formatCOP(0);
    expect(result).toContain('0');
  });

  it('debe manejar decimales (redondea a 0 decimales)', () => {
    const result = formatCOP(1500.99);
    expect(result).toContain('1.501');
  });

  it('debe manejar valores negativos', () => {
    const result = formatCOP(-50000);
    expect(result).toContain('50.000');
  });
});

describe('formatPercent', () => {
  it('debe formatear porcentajes con 1 decimal', () => {
    expect(formatPercent(19)).toBe('19.0%');
    expect(formatPercent(5.5)).toBe('5.5%');
  });

  it('debe manejar cero', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });
});

describe('formatNumber', () => {
  it('debe formatear números con separadores de miles', () => {
    const result = formatNumber(1234567);
    expect(result).toContain('1.234.567');
  });

  it('debe manejar decimales', () => {
    const result = formatNumber(1500.75);
    expect(result).toContain('1.500,75');
  });
});
