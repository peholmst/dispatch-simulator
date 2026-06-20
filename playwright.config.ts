import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  webServer: [
    {
      command: "cmd /c \"set PORT=34100&& node_modules\\.bin\\tsx.CMD src/index.ts\"",
      cwd: "apps/server",
      url: "http://127.0.0.1:34100/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: "cmd /c \"set API_PORT=34100&& node_modules\\.bin\\vite.CMD --host 127.0.0.1 --port 56174 --strictPort\"",
      cwd: "apps/web",
      url: "http://127.0.0.1:56174",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    }
  ],
  use: {
    baseURL: "http://127.0.0.1:56174",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
