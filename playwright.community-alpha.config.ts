import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e/community",
  testMatch: ["**/*.e2e.test.ts"],
  outputDir: ".community-alpha-artifacts/test-results",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.COMMUNITY_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
