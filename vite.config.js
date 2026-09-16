import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  // FIX AUDITORÍA (P1-Testing):
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    sourcemap: false,
    target: "esnext",
    minify: "esbuild",
    cssMinify: true,
    rollupOptions: {
      output: {
        // FIX AUDITORÍA (P1-Build):
        // El manualChunks en forma de objeto generaba (1) un chunk vacío
        // "vendor-react" (React no caía en su chunk asignado en Vite 7) y
        // (2) un warning "Circular chunk: vendor-data -> vendor-ui".
        // Como GestaERP es una app de escritorio Tauri (assets servidos desde
        // disco local, sin caché HTTP que optimizar), la granularidad de estos
        // vendor-chunks no aporta valor: se colapsan todos los node_modules en
        // un único chunk "vendor" (donde no pueden existir ciclos), y se
        // conserva el code-splitting por vistas, que sí reduce el arranque.
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
