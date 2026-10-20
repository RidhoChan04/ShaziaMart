import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "kasir",
      use: { browserName: "chromium", viewport: { width: 1366, height: 768 } },
    },
    {
      name: "owner-hp",
      use: { browserName: "chromium", viewport: { width: 360, height: 800 } },
    },
    {
      name: "owner-laptop",
      use: { browserName: "chromium", viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command:
      "npm run build:mock && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173/kasir",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
