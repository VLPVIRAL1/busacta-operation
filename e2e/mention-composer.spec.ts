/**
 * E2E: @mention autocomplete in the Communication composer.
 *
 * Skipped unless the following env vars are set:
 *   PLAYWRIGHT_BASE_URL
 *   E2E_USER_A_EMAIL / E2E_USER_A_PASSWORD   (logged-in user)
 *   E2E_TASK_ID                              (a task with an existing thread the user can view)
 *   E2E_MENTION_QUERY                        (substring to type after `@`, e.g. "ali")
 *   E2E_MENTION_EXPECTED                     (expected full_name or email of the first match)
 *
 * Run:  bun run test:e2e
 */
import { test, expect, type Page } from "@playwright/test";

const env = {
  email: process.env.E2E_USER_A_EMAIL,
  password: process.env.E2E_USER_A_PASSWORD,
  taskId: process.env.E2E_TASK_ID,
  query: process.env.E2E_MENTION_QUERY,
  expected: process.env.E2E_MENTION_EXPECTED,
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
  ready ? "@mention composer (E2E)" : "@mention composer (E2E — env not set, skipped)",
  () => {
    test.skip(!ready, "Mention E2E env vars not set");

    test("typing @ shows suggestions and selecting inserts the mention token", async ({ page }) => {
      await login(page, env.email!, env.password!);
      await page.goto(`/ops/communication?scope=task&id=${env.taskId}`);

      // Locate the message composer (MentionTextarea uses the shared placeholder)
      const composer = page.getByPlaceholder(/write something|message|reply/i).last();
      await expect(composer).toBeVisible();
      await composer.click();

      // Trigger the mention menu
      await composer.type(`@${env.query}`);

      // Suggestion popover appears with the expected match
      const suggestion = page.getByRole("button", {
        name: new RegExp(env.expected!, "i"),
      });
      await expect(suggestion.first()).toBeVisible({ timeout: 4000 });

      // Click the first suggestion
      await suggestion.first().click();

      // The composer now contains an @[label](uuid) token with the expected label
      const value = await composer.inputValue();
      const tokenRe = new RegExp(
        `@\\[[^\\]]*${env.expected!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\]]*\\]\\([0-9a-f-]{36}\\)`,
        "i",
      );
      expect(value).toMatch(tokenRe);

      // Menu should close after selection
      await expect(suggestion.first()).toBeHidden({ timeout: 2000 });

      // Caret continues after the inserted token + trailing space
      const endsWithSpace = value.endsWith(" ");
      expect(endsWithSpace).toBe(true);
    });

    test("ArrowDown + Enter selects the highlighted suggestion via keyboard", async ({ page }) => {
      await login(page, env.email!, env.password!);
      await page.goto(`/ops/communication?scope=task&id=${env.taskId}`);

      const composer = page.getByPlaceholder(/write something|message|reply/i).last();
      await composer.click();
      await composer.type(`@${env.query}`);

      // Menu is open — navigate + commit with keyboard
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowUp"); // back to first
      await page.keyboard.press("Enter");

      const value = await composer.inputValue();
      expect(value).toMatch(/@\[[^\]]+\]\([0-9a-f-]{36}\)\s$/);
    });
  },
);
