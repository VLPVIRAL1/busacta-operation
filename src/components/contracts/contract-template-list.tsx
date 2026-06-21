import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, FileText, Plus, Search, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { contractTemplatesQuery, useContractFns } from "@/lib/queries/contracts.queries";
import {
  CONTRACT_TYPE_LABELS,
  type ContractTemplate,
  type ContractTemplateStatus,
  type ContractType,
} from "@/lib/contracts/schemas";
import { ContractTemplateEditor } from "./contract-template-editor";

const STATUS_VARIANT: Record<ContractTemplateStatus, "secondary" | "outline"> = {
  draft: "outline",
  published: "secondary",
  archived: "outline",
};

export function ContractTemplateList() {
  const [typeF, setTypeF] = useState<ContractType | "all">("all");
  const [statusF, setStatusF] = useState<ContractTemplateStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const templatesQ = useQuery(contractTemplatesQuery());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (templatesQ.data ?? []).filter((t) => {
      if (typeF !== "all" && t.contract_type !== typeF) return false;
      if (statusF !== "all" && t.status !== statusF) return false;
      if (q && !`${t.name} ${t.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templatesQ.data, typeF, statusF, search]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="pl-8"
            />
          </div>
          <Select value={typeF} onValueChange={(v) => setTypeF(v as ContractType | "all")}>
            <SelectTrigger className="w-full lg:w-36">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {CONTRACT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusF}
            onValueChange={(v) => setStatusF(v as ContractTemplateStatus | "all")}
          >
            <SelectTrigger className="w-full lg:w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" />
            New template
          </Button>
        </CardContent>
      </Card>

      {templatesQ.isLoading ? (
        <Skeleton className="h-72" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={(templatesQ.data ?? []).length === 0 ? "No templates yet" : "No matches"}
          description={
            (templatesQ.data ?? []).length === 0
              ? "Author an NDA or SLA template with mail-merge fields."
              : "Try clearing the filters or search."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} onEdit={() => setEditing(t)} />
          ))}
        </div>
      )}

      {creating && <ContractTemplateEditor open={creating} onOpenChange={setCreating} />}
      {editing && (
        <ContractTemplateEditor
          key={editing.id}
          template={editing}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </div>
  );
}

function TemplateCard({ template, onEdit }: { template: ContractTemplate; onEdit: () => void }) {
  const qc = useQueryClient();
  const { deleteTemplate, duplicateTemplate } = useContractFns();

  const deleteMut = useMutation({
    mutationFn: async () => {
      await deleteTemplate({ data: { id: template.id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("Template deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: async () => {
      await duplicateTemplate({ data: { id: template.id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("Template duplicated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="min-w-0 text-left text-sm font-semibold leading-tight hover:underline"
          >
            <span className="block truncate">{template.name}</span>
          </button>
          <Badge variant="outline" className="shrink-0 font-normal uppercase">
            {CONTRACT_TYPE_LABELS[template.contract_type]}
          </Badge>
        </div>
        {template.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
        )}
        <div className="flex items-center justify-between border-t pt-2">
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[template.status]} className="font-normal capitalize">
              {template.status}
            </Badge>
            <span className="text-[11px] text-muted-foreground">v{template.version}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="Duplicate"
              onClick={() => duplicateMut.mutate()}
              disabled={duplicateMut.isPending}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="Delete"
              onClick={() => {
                if (confirm("Delete this template?")) deleteMut.mutate();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
