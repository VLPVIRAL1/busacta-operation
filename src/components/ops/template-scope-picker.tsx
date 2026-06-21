import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { PROJECT_TYPE_OPTIONS, type ProjectType } from "@/lib/shared/domain";

export function TemplateScopePicker({
  templateId,
  triggerLabel = "Scope",
  compact = false,
}: {
  templateId: string;
  triggerLabel?: string;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [firmIds, setFirmIds] = useState<Set<string>>(new Set());
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set());
  const [projectTypes, setProjectTypes] = useState<Set<ProjectType>>(new Set());

  const { data } = useQuery({
    queryKey: ["template-scope", templateId, open],
    enabled: open,
    queryFn: async () => {
      const [firms, projects, tpl, tplFirms, tplProjects] = await Promise.all([
        supabase.from("firms").select("id, name").order("name"),
        supabase.from("projects").select("id, name, firm_id, project_type").order("name"),
        supabase.from("workflow_templates").select("project_types").eq("id", templateId).single(),
        supabase.from("workflow_template_firms").select("firm_id").eq("template_id", templateId),
        supabase
          .from("workflow_template_projects")
          .select("project_id")
          .eq("template_id", templateId),
      ]);
      return {
        firms: firms.data ?? [],
        projects: projects.data ?? [],
        projectTypes: (tpl.data?.project_types ?? []) as string[],
        linkedFirmIds: (tplFirms.data ?? []).map((r) => r.firm_id),
        linkedProjectIds: (tplProjects.data ?? []).map((r) => r.project_id),
      };
    },
  });

  useEffect(() => {
    if (data) {
      setFirmIds(new Set(data.linkedFirmIds));
      setProjectIds(new Set(data.linkedProjectIds));
      setProjectTypes(new Set(data.projectTypes as ProjectType[]));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const d1 = await supabase
        .from("workflow_template_firms")
        .delete()
        .eq("template_id", templateId);
      if (d1.error) throw new Error(d1.error.message);
      const d2 = await supabase
        .from("workflow_template_projects")
        .delete()
        .eq("template_id", templateId);
      if (d2.error) throw new Error(d2.error.message);
      if (firmIds.size > 0) {
        const r = await supabase
          .from("workflow_template_firms")
          .insert(Array.from(firmIds).map((firm_id) => ({ template_id: templateId, firm_id })));
        if (r.error) throw new Error(r.error.message);
      }
      if (projectIds.size > 0) {
        const r = await supabase
          .from("workflow_template_projects")
          .insert(
            Array.from(projectIds).map((project_id) => ({ template_id: templateId, project_id })),
          );
        if (r.error) throw new Error(r.error.message);
      }
      const u = await supabase
        .from("workflow_templates")
        .update({ project_types: Array.from(projectTypes) } as never)
        .eq("id", templateId);
      if (u.error) throw new Error(u.error.message);
    },
    onSuccess: () => {
      toast.success("Scope updated");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["template-scope", templateId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = <T,>(set: Set<T>, val: T): Set<T> => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  };

  const isUnscoped = firmIds.size === 0 && projectIds.size === 0 && projectTypes.size === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size={compact ? "sm" : "default"}
          variant="outline"
          className={compact ? "h-7 text-xs" : ""}
        >
          <Globe className="h-3.5 w-3.5 mr-1" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Template scope</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isUnscoped && (
            <Badge variant="secondary" className="text-xs">
              No scope set — template is global (available everywhere)
            </Badge>
          )}

          <section>
            <div className="text-xs font-medium uppercase text-muted-foreground mb-1.5">
              Project types
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PROJECT_TYPE_OPTIONS.map((o) => {
                const on = projectTypes.has(o.value);
                return (
                  <Button
                    key={o.value}
                    size="sm"
                    variant={on ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setProjectTypes((s) => toggle(s, o.value))}
                  >
                    {o.label}
                  </Button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="text-xs font-medium uppercase text-muted-foreground mb-1.5">
              Firms ({firmIds.size})
            </div>
            <ScrollArea className="h-32 border rounded-md p-2">
              <div className="space-y-1">
                {(data?.firms ?? []).map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={firmIds.has(f.id)}
                      onCheckedChange={() => setFirmIds((s) => toggle(s, f.id))}
                    />
                    <span>{f.name}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </section>

          <section>
            <div className="text-xs font-medium uppercase text-muted-foreground mb-1.5">
              Projects ({projectIds.size})
            </div>
            <ScrollArea className="h-40 border rounded-md p-2">
              <div className="space-y-1">
                {(data?.projects ?? []).map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={projectIds.has(p.id)}
                      onCheckedChange={() => setProjectIds((s) => toggle(s, p.id))}
                    />
                    <span>{p.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {p.project_type}
                    </Badge>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </section>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save scope
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
