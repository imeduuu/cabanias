import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: ".local/playwright-e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3102", trace: "retain-on-failure" },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "chromium-mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
  ],
});
