import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e/local-play",
  testMatch: "**/*.e2e.test.ts",
  outputDir:
    process.env.PLAYWRIGHT_OUTPUT_DIR ?? ".local-play/artifacts/test-results",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.LOCAL_PLAY_BASE_URL ?? "http://web:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
