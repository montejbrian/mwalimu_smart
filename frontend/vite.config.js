import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir:      "../backend/public",
    emptyOutDir: true,
    sourcemap:   false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react","react-dom","react-router-dom"],
          motion: ["motion"],
          ui:     ["lucide-react","clsx"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/ws":  { target: "ws://localhost:4000",   ws: true },
    },
  },
});
