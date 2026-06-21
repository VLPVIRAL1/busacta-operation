import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatBytes } from "@/lib/format/format-bytes";
import { getTaskFileSignedUrl } from "@/lib/ops/task-documents.functions";

/**
 * CLIENT PORTAL ONLY — read-only file panel for a single task.
 *
 * Hard rules:
 *   - Queries `task_attachments` directly. RLS for the `client` role drops
 *     any row where `is_client_visible = false`, so this list can never
 *     leak internal files. The `.eq("is_client_visible", true)` predicate
 *     is a defensive double-check.
 *   - No upload, no rename, no toggle, no delete, no archive.
 *   - Only operation: download via signed URL (server-fn issues it).
 *
 * We intentionally do NOT import the Golden Master `DocumentManager` here:
 * it ships upload + visibility-toggle + archive UI that has no place in a
 * client surface. See `.lovable/plan.md` Phase 2 for the decision record.
 */
export function PortalTaskFiles({ taskId }: { taskId: string }) {
  const signedUrlFn = useServerFn(getTaskFileSignedUrl);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["portal-task-files", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_attachments")
        .select(
          "id, filename, size_bytes, folder_path, created_at, mime_type, is_client_visible, client_visible_override, archived_at",
        )
        .eq("task_id", taskId)
        .eq("is_client_visible", true)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      // Defensive: never surface a row whose override is explicitly false.
      return (data ?? []).filter((r) => r.client_visible_override !== false);
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.filename.toLowerCase().includes(q) || (r.folder_path ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  async function download(id: string, filename: string) {
    try {
      const res = await signedUrlFn({ data: { fileId: id, download: true } });
      const a = document.createElement("a");
      a.href = res.url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading shared files…
      </div>
    );
  }

  if ((data?.length ?? 0) === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-8 w-8" />}
        title="No shared files yet"
        description="Files your accountant shares with you will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search shared files…"
          className="pl-8"
        />
      </div>

      <div className="grid gap-2">
        {filtered.map((f) => (
          <Card key={f.id} className="border-border/60">
            <CardContent className="flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{f.filename}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {f.folder_path ? `${f.folder_path} · ` : ""}
                    {formatBytes(f.size_bytes ?? 0)} · {new Date(f.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => download(f.id, f.filename)}
                className="shrink-0"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
