import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  webServer: [
    {
      command: "corepack pnpm --filter @dispatch-simulator/server dev",
      cwd: ".",
      env: {
        PORT: "34100"
      },
      url: "http://127.0.0.1:34100/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: "corepack pnpm --filter @dispatch-simulator/web exec vite --host 127.0.0.1 --port 56174 --strictPort",
      cwd: ".",
      env: {
        API_PORT: "34100"
      },
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
