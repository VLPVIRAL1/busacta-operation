/**
 * Visual regression: the Task View Discussion side-panel must remain
 * pixel-stable while it is powered by the shared <ThreadChat> component.
 *
 * The first run produces baseline snapshots under
 *   e2e/task-discussion-visual.spec.ts-snapshots/.
 * Subsequent runs diff against the baseline; failures land in
 * `test-results/` as `*-actual.png` + `*-diff.png` for review.
 *
 * Skipped unless the following env vars are set:
 *   PLAYWRIGHT_BASE_URL
 *   E2E_USER_A_EMAIL / E2E_USER_A_PASSWORD
 *   E2E_TASK_ID            (task whose thread has stable seeded content)
 *
 * Run:        bun run test:e2e
 * Re-baseline: bun run test:e2e -- --update-snapshots
 */
import { test, expect, type Page } from "@playwright/test";

const env = {
  email: process.env.E2E_USER_A_EMAIL,
  password: process.env.E2E_USER_A_PASSWORD,
  taskId: process.env.E2E_TASK_ID,
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
  ready
    ? "Task View Discussion visual regression (E2E)"
    : "Task View Discussion visual regression (E2E — env not set, skipped)",
  () => {
    test.skip(!ready, "Discussion visual E2E env vars not set");

    test("Discussion panel screenshot matches baseline (shared ThreadChat)", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await login(page, env.email!, env.password!);
      await page.goto(`/ops/tasks/${env.taskId}`);

      // Make sure the Discussion side-panel is open.
      const discussion = page.locator("#task-discussion-panel");
      if (!(await discussion.isVisible().catch(() => false))) {
        await page
          .getByRole("button", { name: /discussion/i })
          .first()
          .click();
      }
      await expect(discussion).toBeVisible({ timeout: 6000 });

      // Wait for the thread to settle (skeletons gone, scroll anchored).
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(800);

      // Mask volatile sub-regions so the snapshot focuses on UI/UX, not data:
      //   - relative timestamps ("2m ago")
      //   - presence dots / unread counters
      //   - the composer caret
      const masks = [
        discussion.locator("[data-volatile-time], time, .relative-time"),
        discussion.locator("[data-presence-dot]"),
        discussion.locator("textarea, [contenteditable='true']"),
      ];

      await expect(discussion).toHaveScreenshot("task-discussion-panel.png", {
        animations: "disabled",
        caret: "hide",
        mask: masks,
        maxDiffPixelRatio: 0.01,
      });
    });
  },
);
