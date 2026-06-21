import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, User, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StreamBadge } from "@/components/shared/stream-badge";
import { supabase } from "@/integrations/supabase/client";
import { FirmTabsLazy } from "@/routes/clients/firm.$firmId.index";
import { DirectClientTabsLazy } from "@/components/direct-clients/direct-client-tabs-lazy";
import { directClientDetailQuery } from "@/lib/queries/direct-clients.queries";
import type { UnifiedStream } from "@/lib/queries/unified-clients.queries";

const FIRM_TABS = ["profile", "contacts", "team", "projects", "documents"] as const;
const DIRECT_TABS = ["profile", "contacts", "team", "tasks", "documents"] as const;
type FirmEmbedTab = (typeof FIRM_TABS)[number];
type DirectEmbedTab = (typeof DIRECT_TABS)[number];

function useEmbeddedTab<T extends string>(allowed: readonly T[], fallback: T): [T, (t: T) => void] {
  const search = useSearch({ from: "/clients/" }) as { tab?: string };
  const navigate = useNavigate();
  const tab = (allowed as readonly string[]).includes(search.tab ?? "")
    ? (search.tab as T)
    : fallback;
  const setTab = (t: T) =>
    navigate({
      to: "/clients",
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: t === fallback ? undefined : t }),
      replace: true,
    });
  return [tab, setTab];
}

/**
 * Right-side detail pane. Layout is a flex column that fills its container;
 * the header is fixed at the top and the tab body owns its own scroll. The
 * tabbed children themselves render their TabsList as sticky inside this
 * scroll container (CSS handled in the wrapper below).
 */
export function ClientDetailPane({ stream, id }: { stream: UnifiedStream; id: string }) {
  if (stream === "cpa") return <FirmDetail firmId={id} />;
  return (
    <div className="theme-direct h-full">
      <DirectDetail clientId={id} />
    </div>
  );
}

function FirmDetail({ firmId }: { firmId: string }) {
  const { data: firm, isLoading } = useQuery({
    queryKey: ["firm-hub-firm", firmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firms")
        .select("*")
        .eq("id", firmId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading firm…</div>;
  if (!firm) return <div className="p-6 text-sm text-muted-foreground">Firm not found.</div>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3 shrink-0">
        <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold truncate">{firm.name}</span>
            <StreamBadge stream="cpa" />
            {firm.firm_identifier && (
              <span className="font-mono text-[10px] text-muted-foreground">
                [{firm.firm_identifier}]
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{firm.contact_email ?? "—"}</div>
        </div>
        <Badge variant={firm.status === "deactivated" ? "destructive" : "default"}>
          {firm.status}
        </Badge>
        <Button asChild size="sm" variant="outline">
          <Link to="/clients/firm/$firmId" params={{ firmId }}>
            Open full page <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 client-detail-tabs">
        <EmbeddedFirmTabs firm={firm} firmId={firmId} />
      </div>
    </div>
  );
}

function EmbeddedFirmTabs({ firm, firmId }: { firm: any; firmId: string }) {
  const [tab, setTab] = useEmbeddedTab<FirmEmbedTab>(FIRM_TABS, "profile");
  return <FirmTabsLazy firm={firm} firmId={firmId} tab={tab} onTabChange={setTab} />;
}

function EmbeddedDirectTabs({ clientId }: { clientId: string }) {
  const [tab, setTab] = useEmbeddedTab<DirectEmbedTab>(DIRECT_TABS, "profile");
  return <DirectClientTabsLazy clientId={clientId} tab={tab} onTabChange={setTab} />;
}

function DirectDetail({ clientId }: { clientId: string }) {
  const { data: client, isLoading } = useQuery(directClientDetailQuery(clientId));
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading client…</div>;
  if (!client) return <div className="p-6 text-sm text-muted-foreground">Client not found.</div>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3 shrink-0">
        <User className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold truncate">{client.display_name}</span>
            <StreamBadge stream="direct" />
            {client.identifier && (
              <span className="font-mono text-[10px] text-muted-foreground">
                [{client.identifier}]
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{client.email}</div>
        </div>
        <Badge
          variant={client.status !== "active" ? "destructive" : "default"}
          className="capitalize"
        >
          {client.status}
        </Badge>
        <Button asChild size="sm" variant="outline">
          <Link to="/clients/direct/$clientId" params={{ clientId }}>
            Open full page <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 client-detail-tabs">
        <EmbeddedDirectTabs clientId={clientId} />
      </div>
    </div>
  );
}
