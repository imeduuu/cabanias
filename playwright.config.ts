import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: ".local/playwright-e2e",
  fullyParallel: true,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: ".local/playwright-report", open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3102", trace: "retain-on-failure" },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "chromium-mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 900 } } },
    { name: "firefox-mobile", use: { ...devices["Desktop Firefox"], viewport: { width: 360, height: 800 } } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 900 } } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"], browserName: "webkit", viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
  ],
});
