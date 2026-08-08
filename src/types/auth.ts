// Tipos compartidos entre vistas y App principal.
// Fuente única de verdad para interfaces usadas en múltiples componentes.

/** Usuario autenticado (viene del backend vía login/get_current_user). */
export interface UserInfo {
  id: number;
  full_name: string;
  role: string;
}

/** Roles válidos (deben coincidir con el backend commands/users.rs). */
export const ROLES = {
  ADMIN: "admin",
  SUBADMIN: "subadmin",
  VENDEDOR: "vendedor",
  ASISTENTE: "asistente",
  CASHIER: "cashier",
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Estado de la licencia (viene del backend vía get_license_status). */
export interface LicenseInfo {
  plan: string;
  activated: boolean;
  expires_at: string;
  max_users: number;
  days_left: number;
  modules: string[];
}

/** Notificación del sistema (viene del backend vía get_notifications). */
export interface NotificationItem {
  type: string;
  message: string;
  priority: string;
}

/** Usuario completo (para el store de autenticación). */
export interface User {
  id: number;
  username: string;
  full_name: string;
  role: 'admin' | 'subadmin' | 'vendedor' | 'asistente' | 'cashier';
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

/** Respuesta del comando login. */
export interface LoginResult {
  success: boolean;
  user: User | null;
  error: string | null;
  attempts_remaining: number | null;
}

/** Input para cambio de contraseña (requiere verificación de actual). */
export interface ChangePasswordInput {
  user_id: number;
  current_password: string;
  new_password: string;
}
