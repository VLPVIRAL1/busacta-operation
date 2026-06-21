/**
 * Automated performance test for /ops/todos.
 *
 * Logs in, navigates to the Todos page, then types into the search box and
 * toggles the Status / Scope filters while measuring:
 *   - INP (max event-processing duration during the run)
 *   - Long-task total time
 *   - Layout count + total layout duration
 *   - Style recalc count + total
 *   - JS heap delta
 *
 * Usage:
 *   PERF_BASE_URL="https://manageryash.lovable.app" \
 *   PERF_EMAIL="you@example.com" \
 *   PERF_PASSWORD="..." \
 *   bun run scripts/perf-todos.ts
 *
 * Or against the dev preview, set PERF_BASE_URL accordingly.
 * Output: console summary + JSON written to /mnt/documents/perf-todos.json
 */
import { chromium, type Page } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.PERF_BASE_URL ?? "http://localhost:5173";
const EMAIL = process.env.PERF_EMAIL;
const PASSWORD = process.env.PERF_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set PERF_EMAIL and PERF_PASSWORD env vars.");
  process.exit(1);
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.getByLabel(/password/i).fill(PASSWORD!);
  await Promise.all([
    page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 30_000 }),
    page.getByRole("button", { name: /sign in|log in/i }).click(),
  ]);
}

async function installObservers(page: Page) {
  await page.addInitScript(() => {
    (window as any).__perf = { inp: 0, longTaskMs: 0, events: 0, longTasks: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as PerformanceEventTiming[]) {
          (window as any).__perf.events++;
          if (e.duration > (window as any).__perf.inp) (window as any).__perf.inp = e.duration;
        }
      }).observe({ type: "event", buffered: true, durationThreshold: 16 } as any);
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          (window as any).__perf.longTasks++;
          (window as any).__perf.longTaskMs += e.duration;
        }
      }).observe({ entryTypes: ["longtask"] });
    } catch {}
  });
}

async function snapshot(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x: any) => [x.name, x.value]));
  const perf = await page.evaluate(() => (window as any).__perf);
  return { ...perf, ...m };
}

function diff(a: any, b: any) {
  const out: Record<string, number> = {};
  for (const k of Object.keys(b)) {
    const av = Number(a[k] ?? 0);
    const bv = Number(b[k] ?? 0);
    out[k] = +(bv - av).toFixed(3);
  }
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await installObservers(page);

  console.log("→ login");
  await login(page);

  console.log("→ navigate /ops/todos");
  const navStart = Date.now();
  await page.goto(`${BASE}/ops/todos`, { waitUntil: "networkidle" });
  const navMs = Date.now() - navStart;

  // Wait for the search input to appear
  const search = page.getByPlaceholder(/search by title/i);
  await search.waitFor({ state: "visible", timeout: 15_000 });

  const before = await snapshot(page);

  console.log("→ typing in search");
  for (const ch of "monthly reconciliation review") {
    await search.press(ch === " " ? "Space" : ch);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);
  await search.fill("");

  console.log("→ toggling status filter");
  const statusTriggers = page.locator('[role="combobox"]');
  const triggerCount = await statusTriggers.count();
  if (triggerCount > 0) {
    for (let i = 0; i < Math.min(triggerCount, 2); i++) {
      await statusTriggers.nth(i).click();
      await page.waitForTimeout(150);
      const opt = page.getByRole("option").nth(1);
      if (await opt.count()) await opt.click();
      await page.waitForTimeout(200);
    }
  }

  console.log("→ switching scope tabs");
  const tabs = page.getByRole("tab");
  const tabCount = await tabs.count();
  for (let i = 0; i < Math.min(tabCount, 3); i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(250);
  }

  await page.waitForTimeout(500);
  const after = await snapshot(page);
  const delta = diff(before, after);

  const report = {
    base: BASE,
    navMs,
    before,
    after,
    delta,
    headline: {
      INP_ms: after.inp,
      longTask_total_ms: after.longTaskMs,
      longTasks: after.longTasks,
      events_observed: after.events,
      scriptDuration_delta_ms: +(delta.ScriptDuration * 1000).toFixed(1),
      layoutCount_delta: delta.LayoutCount,
      layoutDuration_delta_ms: +(delta.LayoutDuration * 1000).toFixed(1),
      recalcStyleCount_delta: delta.RecalcStyleCount,
      jsHeapUsed_delta_MB: +(delta.JSHeapUsedSize / 1048576).toFixed(2),
    },
  };

  console.log("\n=== Performance Report ===");
  console.log(JSON.stringify(report.headline, null, 2));

  mkdirSync("/mnt/documents", { recursive: true });
  writeFileSync("/mnt/documents/perf-todos.json", JSON.stringify(report, null, 2));
  console.log("\nFull report → /mnt/documents/perf-todos.json");

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
