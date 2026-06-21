/**
 * E2E: Client portal — invoices list + detail + RLS scoping.
 *
 * Skipped unless the following env vars are set (a CLIENT user with the
 * `invoices` portal capability enabled for their firm):
 *   PLAYWRIGHT_BASE_URL
 *   E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD
 *
 * Run:  bun run test:e2e
 */
import { test, expect, type Page } from "@playwright/test";

const env = {
  email: process.env.E2E_CLIENT_EMAIL,
  password: process.env.E2E_CLIENT_PASSWORD,
};
const ready = Object.values(env).every(Boolean);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe(
  ready ? "portal invoices (E2E)" : "portal invoices (E2E — env not set, skipped)",
  () => {
    test.skip(!ready, "Portal invoice E2E env vars not set");

    test("client sees only issued invoices and can open detail", async ({ page }) => {
      await login(page, env.email!, env.password!);

      await page.goto("/portal/invoices");
      await expect(page.getByRole("heading", { name: /invoices/i })).toBeVisible();

      // No draft/void leakage: every visible status chip is an issued state.
      const statuses = await page.locator("text=/^(sent|partial|paid)$/i").count();
      const forbidden = await page.locator("text=/^(draft|void)$/i").count();
      expect(forbidden).toBe(0);

      // If any invoices are present, the first opens a detail page with a PDF action.
      const firstCard = page.locator('a[href^="/portal/invoices/"]').first();
      if ((await firstCard.count()) > 0 && statuses > 0) {
        await firstCard.click();
        await page.waitForURL(/\/portal\/invoices\/.+/);
        await expect(page.getByRole("button", { name: /download pdf/i })).toBeVisible();
      }
    });
  },
);
