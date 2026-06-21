/**
 * E2E: clicking an inline @mention in a rendered message body jumps to and
 * flashes the same bubble in both routes that mount <ThreadChat>:
 *   - /ops/communication?scope=task&id=<taskId>
 *   - /ops/tasks/<taskId>  (Discussion side panel)
 *
 * Skipped unless the following env vars are set:
 *   PLAYWRIGHT_BASE_URL
 *   E2E_USER_A_EMAIL / E2E_USER_A_PASSWORD
 *   E2E_TASK_ID                 (thread with at least one message containing a mention)
 *   E2E_MENTION_MSG_ID          (uuid of the message whose body contains @[name](uuid))
 *
 * Run:  bun run test:e2e
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

const env = {
  email: process.env.E2E_USER_A_EMAIL,
  password: process.env.E2E_USER_A_PASSWORD,
  taskId: process.env.E2E_TASK_ID,
  msgId: process.env.E2E_MENTION_MSG_ID,
};
const ready = Object.values(env).every(Boolean);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

function bubble(page: Page, msgId: string): Locator {
  return page.locator(`[data-msg-id="${msgId}"]`);
}

/** Click the first @-mention pill inside the target bubble. */
async function clickMentionInBubble(page: Page, msgId: string) {
  const mentionBtn = bubble(page, msgId).locator('button:has-text("@")').first();
  await expect(mentionBtn).toBeVisible({ timeout: 5000 });
  await mentionBtn.click();
}

async function expectFlashed(page: Page, msgId: string) {
  const el = bubble(page, msgId);
  await expect(el).toBeVisible({ timeout: 5000 });
  await expect(el).toHaveAttribute("data-comm-flash", "true", {
    timeout: 2500,
  });
}

test.describe(
  ready ? "mention click jump (E2E)" : "mention click jump (E2E — env not set, skipped)",
  () => {
    test.skip(!ready, "Mention click E2E env vars not set");

    test("clicking a mention in /ops/communication flashes the host bubble", async ({ page }) => {
      await login(page, env.email!, env.password!);
      await page.goto(`/ops/communication?scope=task&id=${env.taskId}&msg=${env.msgId}`);
      // First, the deep-link itself should land us on the bubble.
      await expectFlashed(page, env.msgId!);

      // Wait for the flash to clear, then click the mention to re-trigger jump.
      await page.waitForTimeout(1900);
      await clickMentionInBubble(page, env.msgId!);
      await expectFlashed(page, env.msgId!);
    });

    test("clicking a mention in the Task View Discussion panel flashes the bubble", async ({
      page,
    }) => {
      await login(page, env.email!, env.password!);
      await page.goto(`/ops/tasks/${env.taskId}?msg=${env.msgId}`);

      // Ensure the Discussion panel is open (toggle if it isn't).
      const discussion = page.locator("#task-discussion-panel");
      if (!(await discussion.isVisible().catch(() => false))) {
        await page
          .getByRole("button", { name: /discussion/i })
          .first()
          .click();
        await expect(discussion).toBeVisible({ timeout: 4000 });
      }

      await expectFlashed(page, env.msgId!);
      await page.waitForTimeout(1900);
      await clickMentionInBubble(page, env.msgId!);
      await expectFlashed(page, env.msgId!);
    });
  },
);
