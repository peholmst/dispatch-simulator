import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/ws": {
        target: "ws://127.0.0.1:3000/ws",
        ws: true,
        rewrite: () => "/ws"
      },
      "/api": {
        target: "http://127.0.0.1:3000",
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
