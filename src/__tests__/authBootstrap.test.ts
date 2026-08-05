// FIX AUDITORÍA (P1-Testing): Vitest 4.1.10 no resuelve los imports de "vitest"
// correctamente (describe/it/expect devuelven undefined). Con globals:true y el
// setup.ts, estas funciones están disponibles globalmente, por lo que no se importan.
import { validateBootstrapAdminInput } from "../utils/authBootstrap";

describe("validateBootstrapAdminInput", () => {
  it("acepta datos válidos para el primer administrador", () => {
    const result = validateBootstrapAdminInput({
      username: "admin",
      password: "Admin123!",
      confirmPassword: "Admin123!",
      fullName: "Administrador principal",
    });

    expect(result).toEqual([]);
  });

  it("rechaza contraseñas cortas", () => {
    const result = validateBootstrapAdminInput({
      username: "admin",
      password: "Abc12",
      confirmPassword: "Abc12",
      fullName: "Administrador principal",
    });

    expect(result).toContain("La contraseña debe tener al menos 8 caracteres");
  });

  it("rechaza coincidencia distinta entre contraseñas", () => {
    const result = validateBootstrapAdminInput({
      username: "admin",
      password: "Admin123!",
      confirmPassword: "Otra123!",
      fullName: "Administrador principal",
    });

    expect(result).toContain("Las contraseñas no coinciden");
  });

  it("rechaza nombres de usuario inválidos", () => {
    const result = validateBootstrapAdminInput({
      username: "admin user",
      password: "Admin123!",
      confirmPassword: "Admin123!",
      fullName: "Administrador principal",
    });

    expect(result).toContain("El nombre de usuario solo puede contener letras, números y guion bajo");
  });
});
