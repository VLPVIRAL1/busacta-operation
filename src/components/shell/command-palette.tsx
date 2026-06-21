import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, User } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { REGISTERED_ROUTES } from "@/lib/routing/registered-routes.generated";
import { HUB_SHORTCUTS } from "@/lib/routing/hub-shortcut-map";
import { shouldIgnoreGlobalKey } from "@/lib/keyboard/is-typing-target";
import { clientOmnisearchQuery } from "@/lib/queries/client-omnisearch.queries";
import { useAuth } from "@/lib/auth/auth-context";

const RECENT_KEY = "lov.cmdpalette.recent";

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(path: string) {
  try {
    const cur = readRecent().filter((p) => p !== path);
    const next = [path, ...cur].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function labelForPath(p: string): string {
  if (p === "/") return "Home";
  return p
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/\$/g, ":").replace(/[-_]/g, " "))
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" › ");
}

/**
 * Cmd/Ctrl+K command palette mounted globally in AppShell.
 * Fuzzy search over registered routes + "recent" + LIVE Clients lookup
 * (firms + direct_clients) so the palette doubles as the global client
 * omni-search. Also listens for the `lov:open-command-palette` custom
 * event so a placeholder search input in the top bar can open it.
 */
export function CommandPalette() {
  const router = useRouter();
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const [term, setTerm] = useState("");
  // Debounce the typed term before querying Supabase.
  const [debouncedTerm, setDebouncedTerm] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (shouldIgnoreGlobalKey(e)) return;
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("lov:open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("lov:open-command-palette", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) setRecent(readRecent());
    else {
      setTerm("");
      setDebouncedTerm("");
    }
  }, [open]);

  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedTerm(term.trim()), 200);
    return () => window.clearTimeout(h);
  }, [term]);

  const navigable = useMemo(
    () => REGISTERED_ROUTES.filter((p) => !p.includes("$") && !p.startsWith("/api/") && p !== "/"),
    [],
  );

  const isPrivilegedFirmHub = role === "super_admin" || role === "admin";

  const omni = useQuery(clientOmnisearchQuery(debouncedTerm));
  const firmHits = omni.data?.firms ?? [];
  const directHits = omni.data?.direct ?? [];
  const hasClientResults = firmHits.length + directHits.length > 0;

  const go = (path: string) => {
    pushRecent(path);
    setOpen(false);
    router.navigate({ to: path as never });
  };

  const goFirm = (id: string) => {
    // Route through unified /clients hub with the firm pre-selected. Privileged
    // users can still click "Open full page" in the right pane to reach the
    // CEO-only Firm Hub deep view with pricing.
    void isPrivilegedFirmHub;
    go(`/clients?selected=cpa:${id}`);
  };

  const goDirect = (id: string) => go(`/clients?selected=direct:${id}`);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search clients, jump to a page…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        <CommandEmpty>
          {debouncedTerm.length === 0 ? "Start typing to search…" : "No results found."}
        </CommandEmpty>

        {/* Clients group — only when user is actively searching. */}
        {debouncedTerm.length >= 1 && (omni.isLoading || hasClientResults) && (
          <>
            <CommandGroup heading="Clients">
              {omni.isLoading && (
                <CommandItem disabled value="__loading__">
                  <span className="text-xs text-muted-foreground">Searching clients…</span>
                </CommandItem>
              )}
              {firmHits.map((f) => (
                <CommandItem
                  key={`firm-${f.id}`}
                  value={`firm ${f.name} ${f.firm_identifier ?? ""}`}
                  onSelect={() => goFirm(f.id)}
                >
                  <Building2 className="mr-2 h-4 w-4 text-sky-600 dark:text-sky-300" />
                  <span className="truncate">{f.name}</span>
                  {f.firm_identifier && (
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      [{f.firm_identifier}]
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className="ml-auto gap-1 border-sky-300 bg-sky-50 px-1.5 py-0 text-[10px] uppercase tracking-wide text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200"
                  >
                    CPA
                  </Badge>
                </CommandItem>
              ))}
              {directHits.map((d) => (
                <CommandItem
                  key={`direct-${d.id}`}
                  value={`direct ${d.display_name} ${d.identifier ?? ""}`}
                  onSelect={() => goDirect(d.id)}
                >
                  <User className="mr-2 h-4 w-4 text-rose-600 dark:text-rose-300" />
                  <span className="truncate">{d.display_name}</span>
                  {d.identifier && (
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      [{d.identifier}]
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className="ml-auto gap-1 border-rose-300 bg-rose-50 px-1.5 py-0 text-[10px] uppercase tracking-wide text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
                  >
                    Direct
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {recent.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recent.map((p) => (
                <CommandItem
                  key={`r-${p}`}
                  value={`recent ${p} ${labelForPath(p)}`}
                  onSelect={() => go(p)}
                >
                  {labelForPath(p)}
                  <span className="ml-auto text-xs text-muted-foreground">{p}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading="Hubs">
          {HUB_SHORTCUTS.filter((s) => /^[0-9]$/.test(s.key)).map((s) => (
            <CommandItem key={s.to} value={`hub ${s.label} ${s.to}`} onSelect={() => go(s.to)}>
              {s.label}
              <span className="ml-auto text-xs text-muted-foreground">Alt+{s.key}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="All pages">
          {navigable.map((p) => (
            <CommandItem key={p} value={`${labelForPath(p)} ${p}`} onSelect={() => go(p)}>
              {labelForPath(p)}
              <span className="ml-auto text-xs text-muted-foreground">{p}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
