import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { OPS_COLUMNS } from "@/lib/ops/operating-cycle-nodes";
import { HUB_SHORTCUTS } from "@/lib/routing/hub-shortcut-map";
import { SHORTCUTS, SHORTCUT_GROUPS } from "@/lib/keyboard/shortcut-registry";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-slate-300/70 bg-slate-50 px-1.5 font-mono text-[11px] font-semibold text-slate-700 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-300">
      {children}
    </kbd>
  );
}

function ShortcutsPage() {
  // Built from the same constants the runtime handlers use, so the legend
  // cannot drift from the actual mapping.
  const opsRow1 = OPS_COLUMNS.map((c) => ({ ...c.primary, tier: c.label }));
  const opsRow2 = OPS_COLUMNS.filter((c) => c.secondary).map((c) => ({
    ...c.secondary!,
    tier: c.label,
  }));

  return (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell crumbs={[{ label: "Guide", to: "/guide" }, { label: "Keyboard shortcuts" }]}>
        <PageHeader
          title="Keyboard shortcuts"
          description="Auto-synchronized with the live mapping. Update the source constants and this legend follows."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Operations dashboard tiles</CardTitle>
              <CardDescription>
                On{" "}
                <Link to="/ops" className="underline">
                  /ops
                </Link>
                , press a digit to open a tile. Arrow keys move focus across the 5×2 grid.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Top row
                </div>
                <ul className="space-y-1.5">
                  {opsRow1.map((n) => (
                    <li key={n.shortcut} className="flex items-center gap-3">
                      <Kbd>{n.shortcut}</Kbd>
                      <span className="font-medium">{n.title}</span>
                      <span className="text-xs text-muted-foreground">{n.tier}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Bottom row
                </div>
                <ul className="space-y-1.5">
                  {opsRow2.map((n) => (
                    <li key={n.shortcut} className="flex items-center gap-3">
                      <Kbd>{n.shortcut}</Kbd>
                      <span className="font-medium">{n.title}</span>
                      <span className="text-xs text-muted-foreground">{n.tier}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t pt-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Focus navigation
                </div>
                <ul className="space-y-1.5">
                  <li className="flex items-center gap-3">
                    <Kbd>Tab</Kbd>
                    <span>Enter / leave the grid</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Kbd>←</Kbd>
                    <Kbd>→</Kbd>
                    <span>Move across columns</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd>
                    <span>Switch between rows in the same column</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Kbd>Home</Kbd>
                    <Kbd>End</Kbd>
                    <span>Jump to row ends</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Kbd>Enter</Kbd>
                    <span>Open the focused tile</span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Global hub shortcuts</CardTitle>
              <CardDescription>
                Hold <Kbd>Alt</Kbd> + the key to jump between hubs from anywhere.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {HUB_SHORTCUTS.map((s) => (
                  <li key={`${s.key}-${s.to}`} className="flex items-center gap-3">
                    <Kbd>Alt</Kbd>
                    <span className="text-muted-foreground">+</span>
                    <Kbd>{s.key.toUpperCase()}</Kbd>
                    <span className="font-medium">{s.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{s.to}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Shortcuts are disabled while you're typing in inputs, text areas, or rich editors.
              </p>
            </CardContent>
          </Card>

          {SHORTCUT_GROUPS.map((group) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle className="text-base">{group}</CardTitle>
                <CardDescription>
                  Press <Kbd>?</Kbd> anywhere to open the live cheatsheet.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3">
                      <span className="font-medium">{s.label}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {s.keys.split(/\s+/).map((part, i) => (
                          <Kbd key={i}>{part}</Kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </AppShell>
    </AuthGuard>
  );
}

export const Route = createFileRoute("/guide/shortcuts")({
  head: () => ({
    meta: [
      { title: "Keyboard shortcuts — Guide" },
      {
        name: "description",
        content:
          "Compact legend for global hub shortcuts and operating-cycle tile shortcuts, auto-synchronized with the live mapping.",
      },
    ],
  }),
  component: ShortcutsPage,
  errorComponent: RouteErrorComponent,
});
