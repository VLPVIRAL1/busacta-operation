/**
 * DRY runtime smoke spec (Playwright).
 *
 * Skip-by-default — only runs when the existing E2E seed env vars are set
 * (matches the pattern in playwright.config.ts and other e2e/*.spec.ts).
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 \
 *   E2E_USER_A_EMAIL=... E2E_USER_A_PASSWORD=... \
 *   E2E_TASK_ID=<uuid> \
 *   bun run test:e2e -- dry-smoke.spec.ts
 *
 * Validates that after each DRY refactor, the four Golden surfaces still
 * render and expose their core actions.
 */
import { test, expect } from "@playwright/test";

const TASK_ID = process.env.E2E_TASK_ID;
const USER_EMAIL = process.env.E2E_USER_A_EMAIL;
const USER_PASSWORD = process.env.E2E_USER_A_PASSWORD;
const HAS_SEED = !!(TASK_ID && USER_EMAIL && USER_PASSWORD);

test.skip(!HAS_SEED, "DRY smoke requires E2E_TASK_ID + E2E_USER_A_* env vars");

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(USER_EMAIL!);
  await page.getByLabel(/password/i).fill(USER_PASSWORD!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
}

test.describe("DRY smoke — Golden Master surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Task View renders Notes, Action Items, and Timer controls", async ({ page }) => {
    await page.goto(`/ops/tasks/${TASK_ID}`);
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    // Tabs / panels
    await expect(page.getByText(/notes/i).first()).toBeVisible();
    await expect(
      page.getByText(/(action items|open points|clarifications)/i).first(),
    ).toBeVisible();
    // Timer controls present
    await expect(page.getByRole("button", { name: /(start|stop)/i }).first()).toBeVisible();
  });

  test("Communication hub renders inbox + composer", async ({ page }) => {
    await page.goto("/ops/communication");
    await expect(page).toHaveURL(/\/ops\/communication/);
    await expect(page.locator("textarea, [contenteditable='true']").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Petty Cash ledger renders + Record Payment is reachable", async ({ page }) => {
    await page.goto("/petty-cash");
    await expect(page).toHaveURL(/\/petty-cash/);
    await expect(page.getByRole("link", { name: /record payment|payment/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Finance Chart of Accounts renders", async ({ page }) => {
    await page.goto("/finance/coa");
    await expect(page).toHaveURL(/\/finance\/coa/);
    await expect(page.getByText(/chart of accounts/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /add (account|new)/i }).first()).toBeVisible();
  });
});

test.describe("DRY smoke — Filter call sites", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("/ops/projects renders search input + combobox triggers", async ({ page }) => {
    await page.goto("/ops/projects");
    await expect(page).toHaveURL(/\/ops\/projects/);
    await expect(page.getByPlaceholder(/search projects/i).first()).toBeVisible({
      timeout: 15_000,
    });
    // MultiSelectCombobox renders as a button trigger
    await expect(page.getByRole("button", { name: /status|type|firm/i }).first()).toBeVisible();
  });

  test("/ops/todos renders people-filter trigger", async ({ page }) => {
    await page.goto("/ops/todos");
    await expect(page).toHaveURL(/\/ops\/todos/);
    await expect(
      page.getByRole("button", { name: /(assignee|people|filter)/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("/admin/activity-audit renders date inputs + kind select", async ({ page }) => {
    await page.goto("/admin/activity-audit");
    await expect(page).toHaveURL(/\/admin\/activity-audit/);
    await expect(page.locator("input[type='date']").first()).toBeVisible({ timeout: 15_000 });
  });

  test("/ops/communication GOLDEN inbox toolbar renders", async ({ page }) => {
    await page.goto("/ops/communication");
    await expect(page).toHaveURL(/\/ops\/communication/);
    await expect(page.locator("input, [role='searchbox']").first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

/* ============================================================
   Phase 2 — Client portal isolation
   Skip-by-default. Requires a portal-enabled `firm_contact` for the
   test user, plus seed task_messages with mixed is_client_visible.
   Run locally with:
     PLAYWRIGHT_PORTAL_TASK_ID=<uuid> bunx playwright test e2e/dry-smoke.spec.ts -g "Phase 2"
   ============================================================ */
test.describe("Phase 2: Client portal task view isolation", () => {
  const portalTaskId = process.env.PLAYWRIGHT_PORTAL_TASK_ID;
  test.skip(!portalTaskId, "Set PLAYWRIGHT_PORTAL_TASK_ID + sign in as a client to run.");

  test("does NOT show the Internal/Client visibility toggle in composer", async ({ page }) => {
    await page.goto(`/portal/tasks/${portalTaskId}`);
    // Internal toggle text from ThreadChat composer.
    await expect(page.getByRole("button", { name: /internal only/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /client visible/i })).toHaveCount(0);
  });

  test("does NOT render internal-only tabs", async ({ page }) => {
    await page.goto(`/portal/tasks/${portalTaskId}`);
    for (const forbidden of [
      /notes/i,
      /sub.?tasks/i,
      /open points/i,
      /action items/i,
      /time/i,
      /assignees/i,
    ]) {
      await expect(page.getByRole("tab", { name: forbidden })).toHaveCount(0);
    }
  });

  test("shows only Messages + Files tabs", async ({ page }) => {
    await page.goto(`/portal/tasks/${portalTaskId}`);
    await expect(page.getByRole("tab", { name: /messages/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /files/i })).toBeVisible();
  });

  test("file list never renders an internal-only file", async ({ page }) => {
    await page.goto(`/portal/tasks/${portalTaskId}`);
    await page.getByRole("tab", { name: /files/i }).click();
    // Convention for seed data: internal files are prefixed "INTERNAL_".
    await expect(page.locator("text=/^INTERNAL_/")).toHaveCount(0);
  });

  test("message list never renders an internal-only message", async ({ page }) => {
    await page.goto(`/portal/tasks/${portalTaskId}`);
    // Convention for seed data: internal messages contain the literal "[INTERNAL]".
    await expect(page.locator("text=/\\[INTERNAL\\]/")).toHaveCount(0);
  });
});

/* ============================================================
   Phase 3 — Portal shell, projects, inbox & negative cases
   Skip-by-default. Requires:
     PLAYWRIGHT_PORTAL_PROJECT_ID=<uuid>   (project the test client CAN see)
     PLAYWRIGHT_FOREIGN_TASK_ID=<uuid>     (task the test client must NOT see)
     PLAYWRIGHT_FOREIGN_PROJECT_ID=<uuid>  (project the test client must NOT see)
   ============================================================ */
test.describe("Phase 3: Portal shell + negative access", () => {
  const projectId = process.env.PLAYWRIGHT_PORTAL_PROJECT_ID;
  const foreignTaskId = process.env.PLAYWRIGHT_FOREIGN_TASK_ID;
  const foreignProjectId = process.env.PLAYWRIGHT_FOREIGN_PROJECT_ID;
  test.skip(
    !(projectId && foreignTaskId && foreignProjectId),
    "Set PLAYWRIGHT_PORTAL_PROJECT_ID + PLAYWRIGHT_FOREIGN_TASK_ID + PLAYWRIGHT_FOREIGN_PROJECT_ID.",
  );

  test("portal nav shows Dashboard / Projects / Inbox only", async ({ page }) => {
    await page.goto("/portal");
    for (const label of [/dashboard/i, /projects/i, /inbox/i]) {
      await expect(page.getByRole("link", { name: label }).first()).toBeVisible({
        timeout: 15_000,
      });
    }
    // Internal-only nav must NOT appear in portal.
    for (const forbidden of [/firm hub/i, /finance/i, /petty cash/i, /hr/i, /ops/i]) {
      await expect(page.getByRole("link", { name: forbidden })).toHaveCount(0);
    }
  });

  test("projects list links into project detail", async ({ page }) => {
    await page.goto("/portal/projects");
    await expect(page).toHaveURL(/\/portal\/projects$/);
    await page.locator(`a[href*="/portal/projects/${projectId}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/portal/projects/${projectId}`));
    // Drill-down breadcrumb (Firm + Project) should be present.
    await expect(
      page.getByRole("navigation", { name: /breadcrumb/i }).getByText(/projects/i),
    ).toBeVisible();
  });

  test("guessing a foreign task ID renders access denied (not internal content)", async ({
    page,
  }) => {
    await page.goto(`/portal/tasks/${foreignTaskId}`);
    await expect(page.getByText(/task not available|access|not part of your firm/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("text=/\\[INTERNAL\\]/")).toHaveCount(0);
  });

  test("guessing a foreign project ID renders access denied", async ({ page }) => {
    await page.goto(`/portal/projects/${foreignProjectId}`);
    await expect(page.getByText(/project not available|not part of your firm/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("inbox never renders internal-only message bodies", async ({ page }) => {
    await page.goto("/portal/inbox");
    await expect(page.locator("text=/\\[INTERNAL\\]/")).toHaveCount(0);
  });
});

/* ============================================================
   Plan A — Portal hardening: unified access-denied surface,
   breadcrumb drill-down, and network-leak guard for inbox.
   Skip-by-default. Requires:
     PLAYWRIGHT_PORTAL_TASK_ID
     PLAYWRIGHT_PORTAL_PROJECT_ID
     PLAYWRIGHT_FOREIGN_TASK_ID
     PLAYWRIGHT_FOREIGN_PROJECT_ID
   Optional (anchor breadcrumb assertions):
     PLAYWRIGHT_PORTAL_FIRM_NAME
     PLAYWRIGHT_PORTAL_PROJECT_NAME
     PLAYWRIGHT_PORTAL_ENTITY_NAME
   ============================================================ */
test.describe("Plan A: Portal hardening", () => {
  const portalTaskId = process.env.PLAYWRIGHT_PORTAL_TASK_ID;
  const projectId = process.env.PLAYWRIGHT_PORTAL_PROJECT_ID;
  const foreignTaskId = process.env.PLAYWRIGHT_FOREIGN_TASK_ID;
  const foreignProjectId = process.env.PLAYWRIGHT_FOREIGN_PROJECT_ID;
  test.skip(
    !(portalTaskId && projectId && foreignTaskId && foreignProjectId),
    "Plan A needs PLAYWRIGHT_PORTAL_TASK_ID + PORTAL_PROJECT_ID + FOREIGN_TASK_ID + FOREIGN_PROJECT_ID.",
  );

  test("foreign task renders unified access-denied surface (no internal content)", async ({
    page,
  }) => {
    await page.goto(`/portal/tasks/${foreignTaskId}`);
    const card = page.getByTestId("portal-access-denied");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toHaveAttribute("data-variant", "foreign-task");
    await expect(page.locator("text=/\\[INTERNAL\\]/")).toHaveCount(0);
  });

  test("foreign project renders unified access-denied surface (no breadcrumb)", async ({
    page,
  }) => {
    await page.goto(`/portal/projects/${foreignProjectId}`);
    const card = page.getByTestId("portal-access-denied");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toHaveAttribute("data-variant", "foreign-project");
    await expect(page.getByTestId("portal-breadcrumb")).toHaveCount(0);
  });

  test("task page renders Firm → Project → Entity → Task breadcrumb", async ({ page }) => {
    await page.goto(`/portal/tasks/${portalTaskId}`);
    const crumb = page.getByTestId("portal-breadcrumb");
    await expect(crumb).toBeVisible({ timeout: 15_000 });
    const firmName = process.env.PLAYWRIGHT_PORTAL_FIRM_NAME;
    const projectName = process.env.PLAYWRIGHT_PORTAL_PROJECT_NAME;
    const entityName = process.env.PLAYWRIGHT_PORTAL_ENTITY_NAME;
    if (firmName) await expect(crumb).toContainText(firmName);
    if (projectName) await expect(crumb).toContainText(projectName);
    if (entityName) await expect(crumb).toContainText(entityName);
  });

  test("inbox network responses never carry is_client_visible=false rows", async ({ page }) => {
    const leaks: Array<{ url: string; rowId: string }> = [];
    page.on("response", async (resp) => {
      const url = resp.url();
      if (!/task_messages/.test(url)) return;
      try {
        const body = await resp.text();
        // Look for the literal key:value combination in any JSON shape.
        if (/"is_client_visible"\s*:\s*false/.test(body)) {
          const m = body.match(/"id"\s*:\s*"([^"]+)"[^}]*"is_client_visible"\s*:\s*false/);
          leaks.push({ url, rowId: m?.[1] ?? "<unknown>" });
        }
      } catch {
        // ignore non-text bodies
      }
    });
    await page.goto("/portal/inbox");
    // Give realtime/poll + the initial query time to settle.
    await page.waitForLoadState("networkidle");
    expect(leaks, `Internal-only rows leaked into portal inbox: ${JSON.stringify(leaks)}`).toEqual(
      [],
    );
  });
});
