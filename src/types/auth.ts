export interface User {
  id: number;
  username: string;
  full_name: string;
  role: 'admin' | 'vendedor' | 'cajero';
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface LoginResult {
  success: boolean;
  user: User | null;
  error: string | null;
  attempts_remaining: number | null;
}

export interface CreateUserInput {
  username: string;
  password: string;
  full_name: string;
  role?: string;
}

export interface UpdateUserInput {
  id: number;
  full_name?: string;
  role?: string;
  is_active?: boolean;
}

export interface ChangePasswordInput {
  user_id: number;
  current_password: string;
  new_password: string;
}