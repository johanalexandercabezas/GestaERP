import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Usar imports explícitos en lugar de globales para evitar conflictos con Tauri/Tailwind
    globals: false,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // Excluir módulos que dependen de Tauri API
    server: {
      deps: {
        inline: [],
      },
    },
  },
});
