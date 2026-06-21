import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Trash2, Plus, ExternalLink } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { safeHref } from "@/lib/routing/safe-href";

type LinkType = "knowledge_hub" | "sharepoint" | "client_portal" | "other";

const TYPES: { value: LinkType; label: string; tone: string }[] = [
  {
    value: "knowledge_hub",
    label: "Knowledge Hub",
    tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  {
    value: "sharepoint",
    label: "SharePoint",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  {
    value: "client_portal",
    label: "Client Portal",
    tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  { value: "other", label: "Other", tone: "bg-muted text-foreground" },
];

interface LinkRow {
  id: string;
  url: string;
  description: string | null;
  link_type: LinkType;
  created_at: string;
}

export function TaskLinksPanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const queryKey = ["task-links", taskId];
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState<LinkType>("knowledge_hub");

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_links")
        .select("id, url, description, link_type, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LinkRow[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!url.trim()) return;
      const { error } = await supabase.from("task_links").insert({
        task_id: taskId,
        url: url.trim(),
        description: desc.trim() || null,
        link_type: type,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setUrl("");
      setDesc("");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid gap-2 md:grid-cols-[2fr_2fr_1fr_auto]">
          <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Input
            placeholder="Description (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <Select value={type} onValueChange={(v) => setType(v as LinkType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => add.mutate()} disabled={!url.trim() || add.isPending}>
            <Plus className="h-4 w-4" /> Add link
          </Button>
        </CardContent>
      </Card>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Link2 className="h-10 w-10" />}
          title="No links yet"
          description="Attach references to Knowledge Hub, SharePoint, or Client Portal."
        />
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((l) => {
            const t = TYPES.find((x) => x.value === l.link_type);
            const href = safeHref(l.url);
            return (
              <Card key={l.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={t?.tone}>
                        {t?.label}
                      </Badge>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium truncate hover:underline"
                        >
                          {l.url}
                        </a>
                      ) : (
                        <span
                          className="text-sm font-medium truncate text-muted-foreground"
                          title="Blocked: unsupported URL protocol"
                        >
                          {l.url}
                        </span>
                      )}
                    </div>
                    {l.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{l.description}</div>
                    )}
                  </div>
                  {href && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                      <a href={href} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  <DeleteConfirmDialog
                    entityLabel="Link"
                    entityName={l.description || l.url}
                    onConfirm={() => remove.mutate(l.id)}
                    trigger={
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
