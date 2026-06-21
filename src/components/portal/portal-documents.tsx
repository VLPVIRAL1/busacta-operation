import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Folder, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ProjectCode } from "@/components/shared/entity-code";
import { formatBytes } from "@/lib/format/format-bytes";
import { getTaskFileSignedUrl } from "@/lib/ops/task-documents.functions";

type Props = { firmId: string };

type FileRow = {
  id: string;
  task_id: string;
  filename: string;
  size_bytes: number | null;
  folder_path: string;
  created_at: string;
  task_title: string;
  project_name: string;
  project_code: string | null;
  entity_name: string;
};

export function PortalDocuments({ firmId }: Props) {
  const signedUrlFn = useServerFn(getTaskFileSignedUrl);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["portal-documents", firmId],
    enabled: !!firmId,
    queryFn: async (): Promise<FileRow[]> => {
      // `is_client_visible` is kept in sync by the DB trigger
      // `trg_attachment_resolve_visibility`, which resolves
      // `client_visible_override ?? folder.is_client_visible`. We still
      // double-check `client_visible_override !== false` client-side as a
      // defensive backstop in case the trigger ever lags.
      const { data, error } = await supabase
        .from("task_attachments")
        .select(
          "id, task_id, filename, size_bytes, folder_path, created_at, is_client_visible, client_visible_override, archived_at, tasks(title, client_entities(name, projects(name, code, firm_id)))",
        )
        .eq("is_client_visible", true)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter(
          (r) =>
            r?.tasks?.client_entities?.projects?.firm_id === firmId &&
            r?.client_visible_override !== false,
        )
        .map((r) => ({
          id: r.id,
          task_id: r.task_id,
          filename: r.filename,
          size_bytes: r.size_bytes,
          folder_path: r.folder_path ?? "",
          created_at: r.created_at,
          task_title: r.tasks?.title ?? "Task",
          project_name: r.tasks?.client_entities?.projects?.name ?? "Project",
          project_code: r.tasks?.client_entities?.projects?.code ?? null,
          entity_name: r.tasks?.client_entities?.name ?? "",
        }));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.filename.toLowerCase().includes(q) ||
        r.task_title.toLowerCase().includes(q) ||
        r.project_name.toLowerCase().includes(q) ||
        (r.project_code ?? "").toLowerCase().includes(q) ||
        r.folder_path.toLowerCase().includes(q),
    );
  }, [data, search]);

  // Group: project → task → files (key by project_name preserves stable display label)
  const grouped = useMemo(() => {
    const byProj = new Map<string, { code: string | null; tasks: Map<string, FileRow[]> }>();
    for (const f of filtered) {
      if (!byProj.has(f.project_name))
        byProj.set(f.project_name, { code: f.project_code, tasks: new Map() });
      const bucket = byProj.get(f.project_name)!;
      if (!bucket.tasks.has(f.task_title)) bucket.tasks.set(f.task_title, []);
      bucket.tasks.get(f.task_title)!.push(f);
    }
    return byProj;
  }, [filtered]);

  async function download(id: string, filename: string) {
    try {
      const res = await signedUrlFn({ data: { fileId: id, download: true } });
      const a = document.createElement("a");
      a.href = res.url;
      a.download = filename;
      a.rel = "noreferrer";
      a.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading documents…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-10 w-10" />}
        title="No documents shared yet"
        description="Documents your accounting team marks as shared will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search shared documents…"
          className="h-9 pl-7 pr-7 text-sm"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => setSearch("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents match your search.</p>
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].map(([project, bucket]) => (
            <Card key={project} className="glass border-border-subtle">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ProjectCode code={bucket.code} name={project} />
                  <span className="truncate">{project}</span>
                </div>
                {[...bucket.tasks.entries()].map(([taskTitle, rows]) => (
                  <div key={taskTitle} className="rounded-md border bg-background/40 p-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                      {taskTitle}
                    </div>
                    <ul className="space-y-1">
                      {rows.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between gap-3 rounded px-2 py-1.5 hover:bg-accent/50"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-indigo-500" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{r.filename}</div>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                {r.folder_path && (
                                  <span className="flex items-center gap-1">
                                    <Folder className="h-3 w-3" />
                                    {r.folder_path}
                                  </span>
                                )}
                                <span>{new Date(r.created_at).toLocaleDateString()}</span>
                                {r.size_bytes ? <span>{formatBytes(r.size_bytes)}</span> : null}
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => download(r.id, r.filename)}
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
