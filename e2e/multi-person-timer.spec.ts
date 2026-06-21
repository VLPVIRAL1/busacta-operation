/**
 * Real-browser E2E for the multi-person timer flow.
 *
 * Skipped by default — enable by setting all of:
 *   PLAYWRIGHT_BASE_URL
 *   E2E_USER_A_EMAIL / E2E_USER_A_PASSWORD
 *   E2E_USER_B_EMAIL / E2E_USER_B_PASSWORD
 *   E2E_TASK_ID  (a task both users can view)
 *   E2E_FIRM_ID  (firm that owns the task — for the timesheet check)
 *
 * Then run:  bun run test:e2e
 *
 * The Vitest suite at src/__tests__/multi-person-timer.test.ts is the
 * always-on gate for this behavior; this spec is for occasional verification
 * against a real Supabase test project.
 */
import { test, expect, type Page } from "@playwright/test";

const env = {
  aEmail: process.env.E2E_USER_A_EMAIL,
  aPass: process.env.E2E_USER_A_PASSWORD,
  bEmail: process.env.E2E_USER_B_EMAIL,
  bPass: process.env.E2E_USER_B_PASSWORD,
  taskId: process.env.E2E_TASK_ID,
  firmId: process.env.E2E_FIRM_ID,
};
const ready = Object.values(env).every(Boolean);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe.skip(
  ready ? "multi-person timer (E2E)" : "multi-person timer (E2E — env not set)",
  () => {
    test("A starts with B, both stop independently from different pages", async ({ browser }) => {
      const aCtx = await browser.newContext();
      const bCtx = await browser.newContext();
      const a = await aCtx.newPage();
      const b = await bCtx.newPage();

      // 1. User A starts a 2-person timer on the task
      await login(a, env.aEmail!, env.aPass!);
      await a.goto(`/ops/tasks/${env.taskId}`);
      await a
        .getByRole("button", { name: /start timer/i })
        .first()
        .click();
      await a.getByRole("checkbox", { name: new RegExp(env.bEmail!.split("@")[0], "i") }).check();
      await a.getByRole("button", { name: /^start$/i }).click();
      await expect(a.getByText(/timer started for you \+ 1/i)).toBeVisible();

      // 2. Navigate User A to a different page; the floating timer should follow
      await a.goto(`/security/mfa`);
      await expect(a.getByRole("button", { name: /stop/i })).toBeVisible();

      // 3. User A stops their own row
      await a.getByRole("button", { name: /stop/i }).click();
      await expect(a.getByText(/timer stopped/i)).toBeVisible();

      // 4. User B's session still has an open timer; stop it from B's UI
      await login(b, env.bEmail!, env.bPass!);
      await b.goto(`/ops/tasks/${env.taskId}`);
      await expect(b.getByRole("button", { name: /stop/i })).toBeVisible();
      await b.getByRole("button", { name: /stop/i }).click();
      await expect(b.getByText(/timer stopped/i)).toBeVisible();

      // 5. Timesheet shows two rows with the "Team · 2" badge
      await a.goto(`/ops/firms/${env.firmId}/timesheet`);
      await expect(a.getByText(/team · 2/i).first()).toBeVisible();
      expect(await a.getByText(/team · 2/i).count()).toBeGreaterThanOrEqual(2);

      await aCtx.close();
      await bCtx.close();
    });
  },
);
