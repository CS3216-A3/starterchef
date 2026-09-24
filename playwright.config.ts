import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: process.env.SECURITY_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: process.env.SECURITY_BASE_URL
    ? undefined
    : {
        command:
          process.platform === "win32" ? "npm.cmd run dev" : "npm run dev",
        url: "http://localhost:3000",
        timeout: 120_000,
        reuseExistingServer: true,
      },
});
