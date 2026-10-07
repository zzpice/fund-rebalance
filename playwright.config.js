import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "node tests/server.mjs",
      url: "http://127.0.0.1:4173/",
      reuseExistingServer: !process.env.CI,
      timeout: 15000
    },
    {
      command: "node tests/server.mjs --port 4174 --base-path /zp-folio/",
      url: "http://127.0.0.1:4174/zp-folio/",
      reuseExistingServer: !process.env.CI,
      timeout: 15000
    }
  ],
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
    {
      name: "chromium-pages",
      testMatch: "**/pwa.spec.js",
      use: { browserName: "chromium", baseURL: "http://127.0.0.1:4174/zp-folio/" }
    }
  ]
});
