import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  use: {
    baseURL: process.env.SECURITY_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: process.env.SECURITY_BASE_URL
    ? undefined
    : {
        command: "npm.cmd run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: true,
      },
});
