import { describe, it, expect } from 'vitest';
import { toUpper, onlyNumbers } from '../utils/uppercase';

describe('toUpper', () => {
  it('debe convertir texto a mayúsculas', () => {
    expect(toUpper('hola')).toBe('HOLA');
    expect(toUpper('GestaERP')).toBe('GESTAERP');
  });

  it('debe manejar strings con acentos', () => {
    expect(toUpper('café')).toBe('CAFÉ');
    expect(toUpper('año')).toBe('AÑO');
  });

  it('debe devolver string vacío para null/undefined/vacío', () => {
    expect(toUpper(null)).toBe('');
    expect(toUpper(undefined)).toBe('');
    expect(toUpper('')).toBe('');
  });

  it('debe preservar números y caracteres especiales', () => {
    expect(toUpper('test-123')).toBe('TEST-123');
    expect(toUpper('a_b.c')).toBe('A_B.C');
  });
});

describe('onlyNumbers', () => {
  it('debe extraer solo dígitos', () => {
    expect(onlyNumbers('abc123')).toBe('123');
    expect(onlyNumbers('tel: 300-123-4567')).toBe('3001234567');
  });

  it('debe devolver string vacío si no hay dígitos', () => {
    expect(onlyNumbers('abc')).toBe('');
    expect(onlyNumbers('')).toBe('');
  });

  it('debe manejar NIT colombiano con guión', () => {
    expect(onlyNumbers('900.123.456-7')).toBe('9001234567');
  });
});
