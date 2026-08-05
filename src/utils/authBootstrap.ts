export interface BootstrapAdminInput {
  username: string;
  password: string;
  confirmPassword: string;
  fullName: string;
}

export function validateBootstrapAdminInput(input: BootstrapAdminInput): string[] {
  const errors: string[] = [];

  const username = input.username.trim();
  const password = input.password;
  const confirmPassword = input.confirmPassword;
  const fullName = input.fullName.trim();

  if (!username) {
    errors.push("El nombre de usuario es obligatorio");
  } else if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    errors.push("El nombre de usuario solo puede contener letras, números y guion bajo");
  }

  if (!fullName) {
    errors.push("El nombre completo es obligatorio");
  }

  if (password.length < 8) {
    errors.push("La contraseña debe tener al menos 8 caracteres");
  } else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    errors.push("La contraseña debe incluir mayúsculas, minúsculas y números");
  }

  if (confirmPassword !== password) {
    errors.push("Las contraseñas no coinciden");
  }

  return errors;
}
