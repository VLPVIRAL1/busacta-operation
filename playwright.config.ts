import { defineConfig } from "@playwright/test";

/**
 * Playwright config for the optional real-browser E2E suite.
 *
 * Default `bun test` runs Vitest only — Playwright specs are skip-marked so
 * CI does not fail without a seeded Supabase test environment.
 *
 * To run locally:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 \
 *   E2E_USER_A_EMAIL=... E2E_USER_A_PASSWORD=... \
 *   E2E_USER_B_EMAIL=... E2E_USER_B_PASSWORD=... \
 *   E2E_TASK_ID=<uuid> \
 *   bun run test:e2e
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
