import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Library,
  Plus,
  Search,
  Trash2,
  ExternalLink,
  FileText,
  FileBadge,
  Newspaper,
  LayoutTemplate,
  Image as ImageIcon,
  Video,
  Link2,
  File,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/growth/content")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Growth", to: "/growth" }, { label: "Content Library" }]}>
        <ContentPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type AssetType =
  | "case_study"
  | "collateral"
  | "blog_post"
  | "template"
  | "image"
  | "video"
  | "link"
  | "other";

const ASSET_META: Record<AssetType, { label: string; Icon: LucideIcon }> = {
  case_study: { label: "Case study", Icon: FileBadge },
  collateral: { label: "Collateral", Icon: FileText },
  blog_post: { label: "Blog post", Icon: Newspaper },
  template: { label: "Template", Icon: LayoutTemplate },
  image: { label: "Image", Icon: ImageIcon },
  video: { label: "Video", Icon: Video },
  link: { label: "Link", Icon: Link2 },
  other: { label: "Other", Icon: File },
};

const ASSET_TYPES = Object.entries(ASSET_META).map(([value, m]) => ({
  value: value as AssetType,
  label: m.label,
}));

type Asset = {
  id: string;
  title: string;
  asset_type: AssetType;
  url: string | null;
  description: string | null;
  campaign_id: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignLite = { id: string; name: string };

const NO_CAMPAIGN = "__none__";

function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns", "lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_campaigns")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CampaignLite[];
    },
  });
}

function ContentPage() {
  const { user } = useAuth();
  const [typeF, setTypeF] = useState<AssetType | "all">("all");
  const [search, setSearch] = useState("");

  const assetsQ = useQuery({
    queryKey: ["assets", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_assets")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Asset[];
    },
  });

  const campaignsQ = useCampaigns();
  const campaignName = useMemo(() => {
    const m = new Map<string, string>();
    (campaignsQ.data ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [campaignsQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (assetsQ.data ?? []).filter((a) => {
      if (typeF !== "all" && a.asset_type !== typeF) return false;
      if (q && !`${a.title} ${a.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [assetsQ.data, typeF, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Library"
        description="Case studies, collateral, templates and links your team reuses across campaigns."
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets…"
              className="pl-8"
            />
          </div>
          <Select value={typeF} onValueChange={(v) => setTypeF(v as AssetType | "all")}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ASSET_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AssetDialog ownerId={user?.id ?? ""} />
        </CardContent>
      </Card>

      {assetsQ.isLoading ? (
        <Skeleton className="h-96" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Library className="h-8 w-8" />}
          title={(assetsQ.data ?? []).length === 0 ? "No assets yet" : "No matches"}
          description={
            (assetsQ.data ?? []).length === 0
              ? "Add your first marketing asset using the button above."
              : "Try clearing the filter or search."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const meta = ASSET_META[a.asset_type];
            const Icon = meta.Icon;
            return (
              <Card key={a.id} className="h-full transition-shadow hover:shadow-md">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-sm font-semibold leading-tight">{a.title}</div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {meta.label}
                        </div>
                      </div>
                    </div>
                    <AssetRowActions asset={a} />
                  </div>
                  {a.description && (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{a.description}</p>
                  )}
                  <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                    {a.campaign_id ? (
                      <Badge variant="outline" className="font-normal">
                        {campaignName.get(a.campaign_id) ?? "Campaign"}
                      </Badge>
                    ) : (
                      <span />
                    )}
                    {a.url && (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AssetRowActions({ asset }: { asset: Asset }) {
  const qc = useQueryClient();
  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("marketing_assets").delete().eq("id", asset.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-1">
      <AssetDialog asset={asset} />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          if (confirm("Delete this asset?")) deleteMut.mutate();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function AssetDialog({ asset, ownerId }: { asset?: Asset; ownerId?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(asset?.title ?? "");
  const [type, setType] = useState<AssetType>(asset?.asset_type ?? "case_study");
  const [url, setUrl] = useState(asset?.url ?? "");
  const [description, setDescription] = useState(asset?.description ?? "");
  const [campaignId, setCampaignId] = useState<string>(asset?.campaign_id ?? NO_CAMPAIGN);
  const campaignsQ = useCampaigns();

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title required");
      const payload = {
        title: title.trim(),
        asset_type: type,
        url: url.trim() || null,
        description: description.trim() || null,
        campaign_id: campaignId === NO_CAMPAIGN ? null : campaignId,
        owner_id: asset?.owner_id ?? ownerId ?? user?.id ?? null,
      };
      if (asset) {
        const { error } = await supabase
          .from("marketing_assets")
          .update(payload)
          .eq("id", asset.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("marketing_assets").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      toast.success(asset ? "Updated" : "Added");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {asset ? (
          <Button size="sm" variant="ghost">
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />
            New asset
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit asset" : "New asset"}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div className="grid gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as AssetType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Campaign</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="No campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CAMPAIGN}>— None —</SelectItem>
                  {(campaignsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
