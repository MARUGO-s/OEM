import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/OEM/" : "/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5188,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4318" },
  },
}));
