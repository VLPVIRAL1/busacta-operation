/**
 * Tooltip / TooltipProvider regression spec (Playwright).
 *
 * Guards against the Radix runtime error:
 *   "Tooltip must be used within TooltipProvider"
 *
 * thrown by <FirmCode> / <ProjectCode> when their host page (or any nested
 * portal — dialog, popover, sheet) forgets to mount a TooltipProvider. The
 * root layout (src/routes/__root.tsx) now wraps the whole app in
 * <TooltipProvider>, so these badges should be safe everywhere — including
 * portals/dialogs.
 *
 * Skip-by-default — only runs when the existing E2E seed env vars are set
 * (matches dry-smoke.spec.ts):
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 \
 *   E2E_USER_A_EMAIL=... E2E_USER_A_PASSWORD=... \
 *   bun run test:e2e -- tooltip-entity-code.spec.ts
 *
 * Optional flag to verify the guard itself trips:
 *   E2E_TOOLTIP_NEGATIVE=1 bunx playwright test e2e/tooltip-entity-code.spec.ts -g "negative"
 */
import { test, expect, type Page } from "@playwright/test";

const USER_EMAIL = process.env.E2E_USER_A_EMAIL;
const USER_PASSWORD = process.env.E2E_USER_A_PASSWORD;
const HAS_SEED = !!(USER_EMAIL && USER_PASSWORD);

test.skip(!HAS_SEED, "Tooltip spec requires E2E_USER_A_EMAIL + E2E_USER_A_PASSWORD env vars");

// Radix tooltip-provider errors take several shapes across versions and dev
// vs prod builds. Match all of them.
const TOOLTIP_ERROR_RE =
  /Tooltip[^\n]*TooltipProvider|must be used within[^\n]*Tooltip|TooltipProvider[^\n]*missing|`Tooltip` must be used within `TooltipProvider`/i;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(USER_EMAIL!);
  await page.getByLabel(/password/i).fill(USER_PASSWORD!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
}

interface TooltipGuard {
  errors: string[];
  assertNoTooltipError(): void;
}

/**
 * Attach to a page and capture *any* tooltip-provider error coming from:
 *  - uncaught exceptions (`pageerror`)
 *  - React error boundary console output (`console.error`)
 *  - dev-time downgrades (`console.warning`) — Radix occasionally warns
 *    before throwing.
 *
 * `assertNoTooltipError()` fails the test loudly with the matching messages.
 */
function attachTooltipErrorGuard(page: Page): TooltipGuard {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    errors.push(`[pageerror] ${String(err?.stack ?? err?.message ?? err)}`);
  });
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      errors.push(`[console.${type}] ${msg.text()}`);
    }
  });
  return {
    errors,
    assertNoTooltipError() {
      const offenders = errors.filter((m) => TOOLTIP_ERROR_RE.test(m));
      expect(offenders, `Tooltip provider errors detected:\n${offenders.join("\n----\n")}`).toEqual(
        [],
      );
    },
  };
}

async function exerciseEntityCodes(
  page: Page,
  testid: "firm-code" | "project-code",
  scope?: import("@playwright/test").Locator,
) {
  const root = scope ?? page;
  const all = root.locator(`[data-testid="${testid}"]`);
  const count = await all.count();
  if (count === 0) return false;
  const badge = all.first();
  await badge.scrollIntoViewIfNeeded();
  await badge.hover();
  await expect(page.locator("[role='tooltip']").first()).toBeVisible({ timeout: 5_000 });
  await badge.click({ trial: false }).catch(() => {});
  return true;
}

test.describe("FirmCode / ProjectCode tooltips — global TooltipProvider", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("/ops/time-logs hover + click on FirmCode and ProjectCode never throws", async ({
    page,
  }) => {
    const guard = attachTooltipErrorGuard(page);
    await page.goto("/ops/time-logs");
    await expect(page).toHaveURL(/\/ops\/time-logs/);
    await page.waitForLoadState("networkidle");
    await exerciseEntityCodes(page, "firm-code");
    await exerciseEntityCodes(page, "project-code");
    guard.assertNoTooltipError();
  });

  test("/ops/activity hover on FirmCode never throws", async ({ page }) => {
    const guard = attachTooltipErrorGuard(page);
    await page.goto("/ops/activity");
    await expect(page).toHaveURL(/\/ops\/activity/);
    await page.waitForLoadState("networkidle");
    await exerciseEntityCodes(page, "firm-code");
    guard.assertNoTooltipError();
  });

  test("/ops/notifications hover on FirmCode never throws", async ({ page }) => {
    const guard = attachTooltipErrorGuard(page);
    await page.goto("/ops/notifications");
    await expect(page).toHaveURL(/\/ops\/notifications/);
    await page.waitForLoadState("networkidle");
    await exerciseEntityCodes(page, "firm-code");
    guard.assertNoTooltipError();
  });
});

test.describe("Dialog-scoped tooltips — portals must inherit the global provider", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  /**
   * Open the Task Detail dialog from the Todos table (the page renders
   * <FirmCode>/<ProjectCode> badges both inline AND inside the dialog
   * portal). Tooltips inside the portal are the high-risk case because
   * Radix portals only inherit React context, not DOM context.
   */
  test("/ops/todos → opening a row dialog still resolves FirmCode tooltips", async ({ page }) => {
    const guard = attachTooltipErrorGuard(page);
    await page.goto("/ops/todos");
    await expect(page).toHaveURL(/\/ops\/todos/);
    await page.waitForLoadState("networkidle");

    // Click the first row body (skip header). The exact trigger varies between
    // table cell and row; try a few stable selectors.
    const firstRow =
      (await page.locator("tbody tr").first().count()) > 0
        ? page.locator("tbody tr").first()
        : page.locator("[role='row']").nth(1);
    const rowCount = await firstRow.count();
    if (rowCount === 0) {
      // No data to open. Still verify no tooltip errors fired up to here.
      guard.assertNoTooltipError();
      return;
    }
    await firstRow.click();

    // Radix Dialog uses role="dialog" via DialogContent.
    const dialog = page.locator("[role='dialog']").first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Inside the dialog portal, try FirmCode first, then ProjectCode.
    const firmHit = await exerciseEntityCodes(page, "firm-code", dialog);
    if (!firmHit) await exerciseEntityCodes(page, "project-code", dialog);

    guard.assertNoTooltipError();
  });
});

/**
 * Negative control — proves the guard would actually fail if a tooltip
 * provider error occurred. Off by default because it intentionally
 * injects a fake error into the page console.
 */
test.describe("guard self-check (negative)", () => {
  test.skip(
    process.env.E2E_TOOLTIP_NEGATIVE !== "1",
    "Set E2E_TOOLTIP_NEGATIVE=1 to run the guard self-check.",
  );

  test("emitting a fake tooltip error trips the guard", async ({ page }) => {
    const guard = attachTooltipErrorGuard(page);
    await login(page);
    await page.evaluate(() => console.error("`Tooltip` must be used within `TooltipProvider`"));
    let threw = false;
    try {
      guard.assertNoTooltipError();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
