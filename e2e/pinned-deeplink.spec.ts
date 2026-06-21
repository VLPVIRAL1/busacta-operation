/**
 * E2E: Pinned-message deep-link flash in both Communication Hub and Task View.
 *
 * Skipped unless the following env vars are set:
 *   PLAYWRIGHT_BASE_URL
 *   E2E_USER_A_EMAIL / E2E_USER_A_PASSWORD
 *   E2E_TASK_ID         (task that owns the thread)
 *   E2E_PINNED_MSG_ID   (uuid of a pinned message in that thread)
 *
 * Run:  bun run test:e2e
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

const env = {
  email: process.env.E2E_USER_A_EMAIL,
  password: process.env.E2E_USER_A_PASSWORD,
  taskId: process.env.E2E_TASK_ID,
  msgId: process.env.E2E_PINNED_MSG_ID,
};
const ready = Object.values(env).every(Boolean);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Resolve the bubble element for a given message id (component sets data-msg-id). */
function bubble(page: Page, msgId: string): Locator {
  return page.locator(`[data-msg-id="${msgId}"]`);
}

/**
 * Assert the bubble scrolls into view and receives the unified flash treatment
 * (thread-chat toggles data-comm-flash="true" for ~1700ms via the commFlashMsg
 * keyframe). We poll briefly because navigation + scroll happen async.
 */
async function expectFlashed(page: Page, msgId: string) {
  const el = bubble(page, msgId);
  await expect(el).toBeVisible({ timeout: 5000 });

  // In viewport?
  const inView = await el.evaluate((node) => {
    const r = (node as HTMLElement).getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight + 4;
  });
  expect(inView).toBe(true);

  // Flash attribute toggled
  await expect(el).toHaveAttribute("data-comm-flash", "true", { timeout: 2500 });
}

test.describe(
  ready ? "pinned deep-link flash (E2E)" : "pinned deep-link flash (E2E — env not set, skipped)",
  () => {
    test.skip(!ready, "Pinned deep-link E2E env vars not set");

    test("?msg=<id> on /ops/communication scrolls + flashes the bubble", async ({ page }) => {
      await login(page, env.email!, env.password!);
      await page.goto(`/ops/communication?scope=task&id=${env.taskId}&msg=${env.msgId}`);
      await expectFlashed(page, env.msgId!);
    });

    test("?msg=<id> on /ops/tasks/$taskId scrolls + flashes the bubble in shared ThreadChat", async ({
      page,
    }) => {
      await login(page, env.email!, env.password!);
      await page.goto(`/ops/tasks/${env.taskId}?msg=${env.msgId}`);

      // Discussion section uses the same ThreadChat — same data-msg-id contract.
      await expectFlashed(page, env.msgId!);
    });

    test("clicking the pinned banner from a non-deep-linked load jumps + flashes", async ({
      page,
    }) => {
      await login(page, env.email!, env.password!);
      await page.goto(`/ops/communication?scope=task&id=${env.taskId}`);

      // Pinned banner shows the pinned message; clicking it calls jumpToMessage()
      const pinnedBanner = page
        .locator('[data-pinned-banner="true"], [data-testid="pinned-banner"]')
        .first();
      // Fallback: any button near a Pin icon in the header strip
      const target = (await pinnedBanner.count())
        ? pinnedBanner
        : page.getByRole("button", { name: /pinned/i }).first();

      await expect(target).toBeVisible({ timeout: 5000 });
      await target.click();
      await expectFlashed(page, env.msgId!);
    });
  },
);
