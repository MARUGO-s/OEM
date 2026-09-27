import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/OEM/" : "/",
  plugins: [react()],
  // The audio worker lazy-loads the AC-3 decoder, which needs code splitting.
  worker: { format: "es" },
  // Worker-only deps are otherwise discovered mid-upload, reloading the dev page.
  optimizeDeps: { include: ["mediabunny", "@mediabunny/ac3"] },
  server: {
    host: "127.0.0.1",
    port: 5188,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4318" },
  },
}));
