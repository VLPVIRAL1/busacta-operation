/**
 * DRY Refactor Checklist Modal — dev-only.
 *
 * Mirrors the section-2 checklist from `.lovable/plan.md`. Each refactor
 * "ticket id" (free-text input) gets its own persisted progress in
 * localStorage so multiple in-flight refactors don't collide.
 *
 * Pure UI. No DB writes, no Supabase, no audit logging. Renders only when
 * `import.meta.env.DEV` is true (see __root.tsx).
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClipboardCheck } from "lucide-react";

type Section = { id: string; title: string; items: string[] };

const CHECKLIST: Section[] = [
  {
    id: "props",
    title: "A. Props contract",
    items: [
      "Component accepts the entity id as a prop (taskId / projectId / firmId / vendorId / accountId / scope).",
      "Added embedded?: boolean for chrome swap (default false).",
      "Added readOnly?: boolean for client/portal variants.",
      "Added scope?: 'finance' | 'petty-cash' when ledger is shared.",
      "No internal useParams() — all ids come from props.",
    ],
  },
  {
    id: "queries",
    title: "B. Queries",
    items: [
      "Fetches moved to src/lib/queries/<hub>.queries.ts as queryOptions(...) factories.",
      "Query keys unchanged from pre-refactor (cache survives).",
      "Component consumes via useQuery(factory(...)). No direct supabase.from(...).",
      "Mutations live in *.functions.ts server fns when auth/admin client is needed.",
    ],
  },
  {
    id: "layout",
    title: "C. Layout variants",
    items: [
      "Full-page variant: embedded=false renders PageHeader + container padding.",
      "In-pane variant: embedded=true, no PageHeader, scroll handled by parent.",
      "Read-only variant: readOnly=true hides edit buttons / disables inputs.",
      "All three variants render correctly in their call sites.",
    ],
  },
  {
    id: "audit",
    title: "D. Audit logging",
    items: [
      "Audit events fire from the single source (no duplicate rows).",
      "auditSource prop set so writes are attributable per surface.",
      "Wrapper pages do NOT re-log.",
    ],
  },
  {
    id: "cleanup",
    title: "E. Cleanup",
    items: [
      "All call sites import the Original.",
      "Duplicate files deleted.",
      "Tests pass.",
      "eslint.config.js DRY_ORIGINALS + allow-list updated.",
      ".lovable/plan.md row moved to Done.",
    ],
  },
  {
    id: "guard",
    title: "F. Guardrails",
    items: [
      "Task View files NOT touched.",
      "Communication page files NOT touched.",
      "No changes to src/integrations/supabase/*.",
      "No DB migrations.",
    ],
  },
];

const STORAGE_KEY = (ticket: string) => `dry-checklist:${ticket || "default"}`;

export function DryChecklistModal() {
  const [open, setOpen] = useState(false);
  const [ticket, setTicket] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY(ticket));
      setChecked(raw ? JSON.parse(raw) : {});
    } catch {
      setChecked({});
    }
  }, [ticket]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY(ticket), JSON.stringify(checked));
    } catch {
      /* ignore */
    }
  }, [ticket, checked]);

  const { total, done } = useMemo(() => {
    const all = CHECKLIST.flatMap((s) => s.items.map((_, i) => `${s.id}:${i}`));
    return {
      total: all.length,
      done: all.filter((k) => checked[k]).length,
    };
  }, [checked]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-4 left-4 z-50 gap-2 shadow-lg"
          title="DRY refactor checklist"
        >
          <ClipboardCheck className="h-4 w-4" />
          DRY
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>DRY Refactor Checklist</DialogTitle>
          <DialogDescription>
            Run before merging any consolidation. Mirrors section 2 of <code>.lovable/plan.md</code>
            . Progress persists per ticket id ({done}/{total} complete).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Ticket id</label>
          <Input
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
            placeholder="e.g. R15-page-header"
            className="h-8"
          />
        </div>

        <ScrollArea className="max-h-[55vh] pr-3">
          <div className="space-y-4">
            {CHECKLIST.map((section) => (
              <div key={section.id} className="rounded-md border p-3">
                <h3 className="mb-2 text-sm font-semibold">{section.title}</h3>
                <ul className="space-y-2">
                  {section.items.map((item, i) => {
                    const key = `${section.id}:${i}`;
                    return (
                      <li key={key} className="flex items-start gap-2">
                        <Checkbox
                          id={key}
                          checked={!!checked[key]}
                          onCheckedChange={(v) => setChecked((prev) => ({ ...prev, [key]: !!v }))}
                        />
                        <label htmlFor={key} className="text-sm leading-snug cursor-pointer">
                          {item}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={() => setChecked({})}>
            Reset
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
