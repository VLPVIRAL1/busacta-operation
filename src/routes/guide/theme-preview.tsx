import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sun, Moon } from "lucide-react";
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  PROJECT_TYPE_OPTIONS,
} from "@/lib/shared/domain";

export const Route = createFileRoute("/guide/theme-preview")({
  component: ThemePreviewPage,
  head: () => ({
    meta: [{ title: "Theme preview · Guide" }],
  }),
});

/**
 * Renders children inside a forced theme scope by toggling `.dark` on the
 * wrapper and isolating the cascade with `isolation`.
 */
function ThemeScope({ mode, children }: { mode: "light" | "dark"; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.toggle("dark", mode === "dark");
  }, [mode]);
  return (
    <div ref={ref} className={mode === "dark" ? "dark" : ""} style={{ isolation: "isolate" }}>
      <div className="rounded-2xl border border-border bg-background text-foreground">
        {children}
      </div>
    </div>
  );
}

const SWATCHES: { name: string; bg: string; fg: string }[] = [
  { name: "background", bg: "bg-background", fg: "text-foreground" },
  { name: "card", bg: "bg-card", fg: "text-card-foreground" },
  { name: "primary", bg: "bg-primary", fg: "text-primary-foreground" },
  { name: "accent", bg: "bg-accent", fg: "text-accent-foreground" },
  { name: "secondary", bg: "bg-secondary", fg: "text-secondary-foreground" },
  { name: "muted", bg: "bg-muted", fg: "text-muted-foreground" },
  { name: "success", bg: "bg-success", fg: "text-success-foreground" },
  { name: "warning", bg: "bg-warning", fg: "text-warning-foreground" },
  { name: "destructive", bg: "bg-destructive", fg: "text-destructive-foreground" },
];

function Panel({ mode }: { mode: "light" | "dark" }) {
  const Icon = mode === "dark" ? Moon : Sun;
  return (
    <ThemeScope mode={mode}>
      <div className="space-y-5 p-5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold capitalize">{mode} mode</h2>
        </div>

        {/* Swatches */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Color tokens
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {SWATCHES.map((s) => (
              <div
                key={s.name}
                className={`${s.bg} ${s.fg} rounded-md border border-border p-3 text-xs font-medium`}
              >
                {s.name}
              </div>
            ))}
          </div>
        </section>

        {/* Buttons */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Buttons
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        {/* Input + focus */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Input + focus
          </h3>
          <Input placeholder="Type to test focus ring" className="max-w-sm" />
        </section>

        {/* Domain badges */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status badges
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {TASK_STATUS_OPTIONS.map((s) => (
              <span
                key={s.value}
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${s.tone}`}
              >
                {s.label}
              </span>
            ))}
          </div>
          <h3 className="mt-3 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Priority
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {TASK_PRIORITY_OPTIONS.map((p) => (
              <span key={p.value} className={`text-xs font-semibold ${p.tone}`}>
                {p.label}
              </span>
            ))}
          </div>
          <h3 className="mt-3 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Project types
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {PROJECT_TYPE_OPTIONS.map((s) => (
              <span
                key={s.value}
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${s.tone}`}
              >
                {s.label}
              </span>
            ))}
          </div>
        </section>

        {/* Cards / hover lift */}
        <section className="grid grid-cols-2 gap-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Default card</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Body copy renders against the card surface.
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-sm">Glass card</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Backdrop blur over the page background.
            </CardContent>
          </Card>
        </section>

        {/* Popover */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Popover
          </h3>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Open popover
              </Button>
            </PopoverTrigger>
            <PopoverContent className="text-sm">
              Popover content with shadow + border radius from tokens.
            </PopoverContent>
          </Popover>
        </section>

        {/* Table row */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Interactive rows
          </h3>
          <div className="divide-y divide-border rounded-md border border-border">
            {["Acme Corp · Q3 review", "Globex · Bookkeeping", "Initech · Payroll close"].map(
              (t) => (
                <div
                  key={t}
                  className="interactive-row flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{t}</span>
                  <Badge variant="outline">In progress</Badge>
                </div>
              ),
            )}
          </div>
        </section>

        {/* Sidebar swatch */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sidebar nav
          </h3>
          <div className="rounded-md bg-sidebar p-2 text-sidebar-foreground">
            <div className="rounded-md bg-sidebar-primary px-3 py-2 text-sm text-sidebar-primary-foreground">
              Active link
            </div>
            <div className="mt-1 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              Hover link
            </div>
            <div className="mt-1 rounded-md px-3 py-2 text-sm opacity-80">Idle link</div>
          </div>
        </section>

        {/* Typography */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Typography
          </h3>
          <h1 className="text-2xl font-bold">Heading 1 — quick brown fox</h1>
          <h2 className="text-xl font-semibold">Heading 2 — jumps over</h2>
          <p className="text-sm">
            Body text at 14px renders crisply on the surface. Lorem ipsum dolor sit amet,
            consectetur adipiscing elit.
          </p>
          <p className="text-sm text-muted-foreground">
            Muted secondary text — passes WCAG AA against the surface behind it.
          </p>
        </section>
      </div>
    </ThemeScope>
  );
}

function ThemePreviewPage() {
  return (
    <AppShell crumbs={[{ label: "Guide", to: "/guide" }, { label: "Theme preview" }]}>
      <PageHeader
        title="Theme preview"
        description="Visual sanity check for the navy + bright-blue palette in light and dark modes."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel mode="light" />
        <Panel mode="dark" />
      </div>
    </AppShell>
  );
}
