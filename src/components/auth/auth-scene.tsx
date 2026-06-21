import { ReactNode } from "react";
import {
  Receipt,
  FileSpreadsheet,
  Wallet,
  ShieldCheck,
  BarChart3,
  Users,
  CheckCircle2,
  Calculator,
  FileText,
  Building2,
} from "lucide-react";
import { useBranding } from "@/lib/shared/branding";

type Chip = {
  icon: typeof Receipt;
  title: string;
  sub: string;
  pos: string; // desktop position
};

// Desktop positions avoid the centered form column (≈max-w-md) and the top-left brand pill.
const CHIPS: Chip[] = [
  {
    icon: Receipt,
    title: "Petty Cash",
    sub: "Live ledger · INR",
    pos: "top-[18%] left-[3%] w-[210px]",
  },
  {
    icon: FileSpreadsheet,
    title: "Tax Returns",
    sub: "1040 · 1120 · 1065",
    pos: "top-[14%] right-[3%] w-[220px]",
  },
  {
    icon: Wallet,
    title: "Bookkeeping",
    sub: "Reconciled · Monthly",
    pos: "top-[44%] left-[2%] w-[200px]",
  },
  {
    icon: ShieldCheck,
    title: "SOC-Ready",
    sub: "Per-firm RLS isolation",
    pos: "top-[70%] left-[4%] w-[230px]",
  },
  {
    icon: BarChart3,
    title: "Reports",
    sub: "P&L · BS · Cash flow",
    pos: "top-[42%] right-[2%] w-[210px]",
  },
  {
    icon: Users,
    title: "Client Portal",
    sub: "Tasks · Messages",
    pos: "top-[68%] right-[4%] w-[210px]",
  },
];

const PILLS = [
  { icon: CheckCircle2, label: "CPA-supervised" },
  { icon: Calculator, label: "GAAP-aligned" },
  { icon: FileText, label: "Audit trail" },
  { icon: Building2, label: "Multi-firm" },
];

export function AuthScene({ children }: { children: ReactNode }) {
  const branding = useBranding();
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Static feature cards: desktop only, flat + bordered, behind the form */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        {CHIPS.map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={i}
              className={`absolute rounded-2xl border border-border bg-card p-3.5 shadow-sm ${c.pos}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{c.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{c.sub}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust pills strip — desktop only, above form, never clipped */}
      <div className="hidden lg:flex absolute bottom-5 left-1/2 -translate-x-1/2 z-30">
        <div className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 shadow-sm">
          {PILLS.map((p, i) => {
            const Icon = p.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-foreground/90"
              >
                <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                {p.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Brand mark — top-left flat pill (compact on mobile) */}
      <a
        href="/"
        className="absolute top-3 left-3 sm:top-5 sm:left-5 z-20 flex items-center gap-2 sm:gap-3 rounded-2xl border border-border bg-card px-2.5 py-1.5 shadow-sm sm:px-3.5 sm:py-2 focus-ring-auth"
        aria-label={`${branding.name} home`}
      >
        {branding.logo_url ? (
          <img
            src={branding.logo_url}
            alt=""
            aria-hidden
            className="h-9 w-9 rounded-xl border border-border object-contain bg-white p-1 sm:h-11 sm:w-11"
          />
        ) : (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary font-bold text-primary-foreground sm:h-11 sm:w-11"
            aria-hidden
          >
            {branding.mark}
          </div>
        )}
        <div className="flex flex-col leading-tight pr-1">
          <span className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
            {branding.name}
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline">
            {branding.tagline}
          </span>
        </div>
      </a>

      {/* Form slot */}
      <main className="relative z-10 flex min-h-screen items-center justify-center p-4 pb-32 pt-20 sm:p-6 sm:pt-24 lg:pb-24">
        {children}
      </main>

      {/* Mobile stacked feature cards + footer pills (replaces free-floating layer) */}
      <div className="absolute inset-x-0 bottom-0 z-10 lg:hidden">
        <div className="flex gap-2 overflow-x-auto px-3 pb-3 no-scrollbar">
          {CHIPS.slice(0, 4).map((c, i) => {
            const Icon = c.icon;
            return (
              <div
                key={i}
                className="flex min-w-[170px] shrink-0 items-center gap-2.5 rounded-2xl border border-border bg-card p-2.5 shadow-sm"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-foreground">{c.title}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{c.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-border bg-card px-3 py-2 text-[11px] text-foreground/80">
          <span className="font-medium" suppressHydrationWarning>
            © {new Date().getFullYear()} {branding.name}
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
            CPA-supervised
          </span>
        </div>
      </div>
    </div>
  );
}
