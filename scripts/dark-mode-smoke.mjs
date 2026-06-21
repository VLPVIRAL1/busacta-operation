#!/usr/bin/env node
/**
 * Dark-mode UI smoke test.
 *
 * Visits the major hubs after forcing dark mode on the document root,
 * captures a full-page screenshot, and walks the DOM to flag any text
 * node whose computed color vs background falls below WCAG AA.
 *
 * Outputs:
 *   tests/__snapshots__/darkmode/<page>.png   (screenshots)
 *   dark-mode-findings.json                   (offending elements)
 *
 * Flags:
 *   --strict   exit 1 if any finding is reported
 *
 * Requires env: PLAYWRIGHT_BASE_URL, E2E_USER_A_EMAIL, E2E_USER_A_PASSWORD
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STRICT = process.argv.includes("--strict");
const BASE = process.env.PLAYWRIGHT_BASE_URL;
const EMAIL = process.env.E2E_USER_A_EMAIL;
const PASSWORD = process.env.E2E_USER_A_PASSWORD;

if (!BASE || !EMAIL || !PASSWORD) {
  console.log("[dark-mode-smoke] missing seed env — skipping.");
  process.exit(0);
}

const PAGES = [
  ["dashboard", "/dashboard"],
  ["ops-firms", "/ops/firms"],
  ["ops-projects", "/ops/projects"],
  ["ops-tasks", "/ops/tasks"],
  ["ops-reports", "/ops/reports"],
  ["ops-workflow-templates", "/ops/workflow-templates"],
  ["petty-cash", "/petty-cash"],
];

const OUT_DIR = resolve("tests/__snapshots__/darkmode");
mkdirSync(OUT_DIR, { recursive: true });

const findings = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Login.
await page.goto(`${BASE}/login`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });

for (const [name, path] of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`), fullPage: true });

  const pageFindings = await page.evaluate(() => {
    const parse = (s) => {
      const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      return m ? [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1] : null;
    };
    const lum = ([r, g, b]) => {
      const f = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const la = lum(a),
        lb = lum(b);
      const [hi, lo] = la > lb ? [la, lb] : [lb, la];
      return (hi + 0.05) / (lo + 0.05);
    };
    const bgOf = (el) => {
      let cur = el;
      while (cur && cur !== document.documentElement) {
        const bg = parse(getComputedStyle(cur).backgroundColor || "");
        if (bg && bg[3] > 0.5) return bg;
        cur = cur.parentElement;
      }
      return [11, 15, 25, 1]; // canvas fallback
    };
    const out = [];
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      const text = (el.textContent || "").trim();
      if (!text || text.length < 2) continue;
      // Only leaf-ish nodes
      if (el.children.length > 0 && el.firstChild?.nodeType !== 3) continue;
      const s = getComputedStyle(el);
      const fg = parse(s.color);
      if (!fg) continue;
      const bg = bgOf(el);
      const size = parseFloat(s.fontSize);
      const bold = parseInt(s.fontWeight, 10) >= 600;
      const threshold = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      const r = ratio(fg, bg);
      if (r < threshold) {
        out.push({
          selector:
            el.tagName.toLowerCase() +
            (el.className ? "." + String(el.className).split(/\s+/).slice(0, 2).join(".") : ""),
          text: text.slice(0, 60),
          fg: `rgb(${fg.slice(0, 3).join(",")})`,
          bg: `rgb(${bg.slice(0, 3).join(",")})`,
          ratio: +r.toFixed(2),
          required: threshold,
          fontSize: size,
        });
        if (out.length >= 25) break;
      }
    }
    return out;
  });

  for (const f of pageFindings) findings.push({ page: name, ...f });
  console.log(`[${name}] ${pageFindings.length} findings`);
}

await browser.close();

writeFileSync("dark-mode-findings.json", JSON.stringify(findings, null, 2));
console.log(`Wrote ${findings.length} findings -> dark-mode-findings.json`);

if (STRICT && findings.length > 0) process.exit(1);
