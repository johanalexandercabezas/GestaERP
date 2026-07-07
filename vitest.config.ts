import { defineConfig } from "vitest/config";

export default defineConfig({
  // Sobrescribir plugins para evitar que Tailwind cause conflictos con vitest
  plugins: [],
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
  },
});
