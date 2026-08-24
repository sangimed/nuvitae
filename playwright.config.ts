import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: [
    "accessibility/**/*.a11y.test.ts",
    "browser/resume-export/**/*.spec.ts",
    "browser/resume-workspace/**/*.spec.ts",
  ],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter @nuvitae/contracts build && pnpm --filter @nuvitae/web dev",
    url: "http://127.0.0.1:3000/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
