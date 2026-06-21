// Applies all migrations to a Supabase project via the Management API.
// Uses a Personal Access Token (sbp_...) — bypasses direct PG connection.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const PAT = process.env.SUPABASE_PAT;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "sgewqhxcknlllpkcurkf";
const MIGRATIONS_DIR = "supabase/migrations";

if (!PAT) {
  console.error("Missing SUPABASE_PAT env var");
  process.exit(1);
}

const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function runSql(sql) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

console.log(`Found ${files.length} migrations. Applying...\n`);

const failures = [];
let applied = 0;
const startTime = Date.now();

for (const file of files) {
  const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
  const result = await runSql(sql);
  if (result.ok) {
    applied++;
    if (applied % 10 === 0 || applied === files.length) {
      const pct = ((applied / files.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ${applied}/${files.length} (${pct}%) — ${elapsed}s`);
    }
  } else {
    failures.push({ file, status: result.status, body: result.body });
    console.error(`FAIL ${file}: HTTP ${result.status}`);
    console.error(`  ${JSON.stringify(result.body).slice(0, 300)}\n`);
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n=== DONE ===`);
console.log(`Applied: ${applied}/${files.length}`);
console.log(`Failed:  ${failures.length}`);
console.log(`Time:    ${elapsed}s`);

if (failures.length > 0) {
  console.log("\nFailed migrations:");
  failures.forEach((f) => console.log(`  - ${f.file} (HTTP ${f.status})`));
  process.exit(1);
}
