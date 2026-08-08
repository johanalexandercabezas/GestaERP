import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { User, LoginResult, ChangePasswordInput } from '../types/auth';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;

  // Acciones
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  createAdminUser: (username: string, password: string, fullName: string) => Promise<User>;
  hasAnyUser: () => Promise<boolean>;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
}

/**
 * Auth Store — Gestión de sesión segura.
 *
 * SEGURIDAD: La sesión se verifica contra el backend en cada `checkSession()`.
 * NO se almacena información sensible en localStorage.
 * El backend mantiene el estado real de autenticación.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  error: null,
  isAuthenticated: false,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<LoginResult>('login', { username, password });

      if (result.success && result.user) {
        set({
          user: result.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        set({
          isLoading: false,
          error: result.error || 'Credenciales inválidas',
        });
      }

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ isLoading: false, error: errorMsg });
      return {
        success: false,
        user: null,
        error: errorMsg,
        attempts_remaining: null,
      };
    }
  },

  logout: async () => {
    try {
      await invoke('logout');
    } catch {
      // Incluso si falla el backend, limpiamos el estado local
    }
    set({
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  checkSession: async () => {
    try {
      const currentUser = await invoke<User | null>('get_current_user');
      if (currentUser && currentUser.is_active) {
        set({ user: currentUser, isAuthenticated: true, isLoading: false });
        return;
      }
    } catch {
      // Sesión inválida o expirada
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  createAdminUser: async (username: string, password: string, fullName: string) => {
    const user = await invoke<User>('create_bootstrap_admin', {
      username,
      password,
      full_name: fullName,
    });
    return user;
  },

  hasAnyUser: async () => {
    return await invoke<boolean>('has_any_user');
  },

  // TODO AUD-005: changePassword requiere verificación de contraseña actual.
  // El backend expone update_user pero sin validación de contraseña actual.
  // Pendiente implementar comando change_password con verificación de credenciales actuales.
  changePassword: async (input: ChangePasswordInput) => {
    await invoke('update_user', {
      id: input.user_id,
      fullName: '',
      role: '',
      active: true,
      newPassword: input.new_password,
    });
  },
}));
