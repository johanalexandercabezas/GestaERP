import { describe, it, expect } from 'vitest';
import type { UserInfo, LicenseInfo, NotificationItem } from '../types/auth';

// ============================================================
// Tests de tipos compartidos (AUD-015/AUD-017)
// Verifica que las interfaces centralizadas son consistentes
// con lo que el backend devuelve en runtime.
// ============================================================

describe('UserInfo type', () => {
  it('debe aceptar un objeto de usuario del backend', () => {
    const user: UserInfo = { id: 1, full_name: 'Admin', role: 'admin' };
    expect(user.id).toBe(1);
    expect(user.full_name).toBe('Admin');
    expect(user.role).toBe('admin');
  });

  it('debe aceptar todos los roles válidos', () => {
    const roles = ['admin', 'subadmin', 'vendedor', 'asistente', 'cashier'] as const;
    for (const role of roles) {
      const user: UserInfo = { id: 1, full_name: 'Test', role };
      expect(user.role).toBe(role);
    }
  });
});

describe('LicenseInfo type', () => {
  it('debe aceptar una licencia activa', () => {
    const lic: LicenseInfo = {
      plan: 'avanzado',
      activated: true,
      expires_at: '2026-12-31',
      max_users: 6,
      days_left: 30,
      modules: ['dashboard', 'products', 'pos'],
    };
    expect(lic.activated).toBe(true);
    expect(lic.modules).toHaveLength(3);
  });

  it('debe aceptar una licencia inactiva (sin módulos)', () => {
    const lic: LicenseInfo = {
      plan: 'none',
      activated: false,
      expires_at: '',
      max_users: 0,
      days_left: 0,
      modules: [],
    };
    expect(lic.activated).toBe(false);
    expect(lic.modules).toHaveLength(0);
  });
});

describe('NotificationItem type', () => {
  it('debe aceptar una notificación del backend', () => {
    const notif: NotificationItem = {
      type: 'warning',
      message: 'Stock bajo: Aceite 20W50',
      priority: 'high',
    };
    expect(notif.type).toBe('warning');
    expect(notif.priority).toBe('high');
  });
});
