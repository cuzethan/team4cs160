import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: {
      usePolling: true,
    },
    // The site calls /api/...; Vite forwards it to the backend so cookies stay same-origin.
    proxy: {
      "/api": process.env.API_PROXY_TARGET ?? "http://localhost:3001",
    },
  },
});
