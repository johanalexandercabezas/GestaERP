import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-ignore
const host = process.env.TAURI_DEV_HOST as string | undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
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
    // ============================================================
    // OPTIMIZACIONES DE BUILD
    // ============================================================
    minify: "esbuild" as const,
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": ["framer-motion", "lucide-react", "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu", "@radix-ui/react-select",
            "@radix-ui/react-tabs", "@radix-ui/react-tooltip"],
          "vendor-data": ["zustand", "@tanstack/react-table", "@hookform/resolvers",
            "react-hook-form", "zod", "recharts"],
        },
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
