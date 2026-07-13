export interface UserInfo {
  id: number;
  username: string;
  full_name: string;
  role: string;
}

export interface LoginResult {
  success: boolean;
  user: UserInfo | null;
  error: string | null;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  cashier: "Cajero",
};

export const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  manager: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  cashier: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};