import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const apiPort = process.env.API_PORT ?? "3000";
const apiHttpTarget = `http://127.0.0.1:${apiPort}`;
const apiWsTarget = `ws://127.0.0.1:${apiPort}/ws`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@dispatch-simulator/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url))
    }
  },
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
