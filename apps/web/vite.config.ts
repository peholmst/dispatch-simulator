import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = process.env.API_PORT ?? "3000";
const apiHttpTarget = `http://127.0.0.1:${apiPort}`;
const apiWsTarget = `ws://127.0.0.1:${apiPort}/ws`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/ws": {
        target: apiWsTarget,
        ws: true,
        rewrite: () => "/ws"
      },
      "/api": {
        target: apiHttpTarget,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
