/**
 * DRY codemod — rewrites imports of registered Original component names to
 * their canonical paths. Defensive by design:
 *
 *   • Touches IMPORTS ONLY. Never edits JSX, props, queries, or logic.
 *   • Skips Golden Master files (Task View, Communication, Petty Cash,
 *     Finance COA, Open Points, generated files).
 *   • Dry-run by default. Pass --write to apply.
 *
 * Run:
 *   bunx tsx scripts/dry-codemod.ts          # dry-run, prints diffs
 *   bunx tsx scripts/dry-codemod.ts --write  # apply
 *
 * Registry must stay in sync with eslint.config.js → DRY_ORIGINALS and
 * .lovable/plan.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

type Original = { name: string; canonical: string };

const REGISTRY: Original[] = [
  { name: "PageHeader", canonical: "@/components/shell/app-shell" },
  { name: "EmptyState", canonical: "@/components/shared/empty-state" },
  { name: "ExportMenu", canonical: "@/components/shared/export-menu" },
  { name: "DateRangeFilter", canonical: "@/components/shared/date-range-filter" },
  { name: "AssigneeStack", canonical: "@/components/shared/assignee-stack" },
  { name: "FilterBar", canonical: "@/components/shared/filter-bar" },
  { name: "PeoplePicker", canonical: "@/components/shared/people-picker" },
  { name: "SinglePersonPicker", canonical: "@/components/shared/single-person-picker" },
  { name: "MultiPersonPicker", canonical: "@/components/shared/multi-person-picker" },
  { name: "TaskNotesPanel", canonical: "@/components/ops/task-notes-panel" },
  { name: "TaskActionItemsPanel", canonical: "@/components/ops/task-action-items-panel" },
  { name: "SubtaskList", canonical: "@/components/ops/subtask-list" },
  { name: "DocumentManager", canonical: "@/components/ops/document-manager" },
  { name: "ThreadChat", canonical: "@/components/ops/communication/thread-chat" },
  { name: "TaskLinksPanel", canonical: "@/components/ops/task-links-panel" },
  { name: "TaskTimerControl", canonical: "@/components/ops/timer-widget" },
  { name: "VendorDialog", canonical: "@/components/finance/vendor-dialog" },
];

const GOLDEN_MASTER_PATTERNS = [
  /^src\/components\/ops\/task-.*\.tsx$/,
  /^src\/components\/ops\/subtask-list\.tsx$/,
  /^src\/components\/ops\/document-manager\.tsx$/,
  /^src\/components\/ops\/task-timer-control\.tsx$/,
  /^src\/components\/ops\/direct-messages-page\.tsx$/,
  /^src\/components\/ops\/communication\//,
  /^src\/routes\/ops\/communication\.tsx$/,
  /^src\/routes\/ops\/firms\.\$firmId\.communication\.tsx$/,
  /^src\/components\/petty-cash\//,
  /^src\/routes\/petty-cash\//,
  /^src\/components\/finance\/chart-of-accounts-page\.tsx$/,
  /^src\/integrations\/supabase\//,
  /^src\/routeTree\.gen\.ts$/,
  /\.generated\.ts$/,
];

const WRITE = process.argv.includes("--write");

function isGoldenMaster(rel: string): boolean {
  return GOLDEN_MASTER_PATTERNS.some((p) => p.test(rel));
}

function listSourceFiles(): string[] {
  // node:fs globSync is available in Bun and recent Node.
  return globSync("src/**/*.{ts,tsx}", { nodir: true } as never) as string[];
}

type Change = { file: string; from: string; to: string; names: string[] };

function rewriteImports(source: string): { next: string; changes: Change[] } {
  let next = source;
  const changes: Change[] = [];

  // Match: import { A, B as C } from "some/path";
  const re = /import\s*\{\s*([^}]+?)\s*\}\s*from\s*["']([^"']+)["'];?/g;

  next = next.replace(re, (full, namesRaw: string, fromPath: string) => {
    const specs = namesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const matched = specs.filter((spec) => {
      const name = spec.split(/\s+as\s+/)[0].trim();
      return REGISTRY.some((o) => o.name === name && o.canonical !== fromPath);
    });
    if (matched.length === 0) return full;

    // Group matched specs by canonical target.
    const buckets = new Map<string, string[]>();
    const keep: string[] = [];
    for (const spec of specs) {
      const name = spec.split(/\s+as\s+/)[0].trim();
      const original = REGISTRY.find((o) => o.name === name);
      if (original && original.canonical !== fromPath) {
        const list = buckets.get(original.canonical) ?? [];
        list.push(spec);
        buckets.set(original.canonical, list);
      } else {
        keep.push(spec);
      }
    }

    const lines: string[] = [];
    if (keep.length) lines.push(`import { ${keep.join(", ")} } from "${fromPath}";`);
    for (const [canonical, list] of buckets) {
      lines.push(`import { ${list.join(", ")} } from "${canonical}";`);
      changes.push({ file: "", from: fromPath, to: canonical, names: list });
    }
    return lines.join("\n");
  });

  return { next, changes };
}

function main() {
  const files = listSourceFiles();
  const allChanges: Change[] = [];
  let touched = 0;

  for (const file of files) {
    const rel = file.replaceAll("\\", "/");
    if (isGoldenMaster(rel)) continue;

    const src = readFileSync(file, "utf8");
    const { next, changes } = rewriteImports(src);
    if (changes.length === 0 || next === src) continue;

    changes.forEach((c) => (c.file = rel));
    allChanges.push(...changes);
    touched++;

    if (WRITE) writeFileSync(file, next, "utf8");
  }

  if (allChanges.length === 0) {
    console.log("DRY codemod: no rogue imports of registered Originals found.");
    console.log(`Scanned ${files.length} files, skipped Golden Masters.`);
    return;
  }

  console.log(
    `DRY codemod: ${WRITE ? "applied" : "would apply"} ${allChanges.length} rewrite(s) in ${touched} file(s):\n`,
  );
  for (const c of allChanges) {
    console.log(`  ${c.file}`);
    console.log(`    ${c.names.join(", ")}: "${c.from}" → "${c.to}"`);
  }
  if (!WRITE) console.log(`\nDry-run. Re-run with --write to apply.`);
}

main();
