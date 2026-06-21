import { useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Braces, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RichEditor, RichViewer } from "@/components/shared/rich-editor";
import { useAuth } from "@/lib/auth/auth-context";
import { useContractFns } from "@/lib/queries/contracts.queries";
import {
  CONTRACT_TYPE_LABELS,
  type ContractTemplate,
  type ContractTemplateStatus,
  type ContractType,
} from "@/lib/contracts/schemas";
import {
  CONTRACT_MERGE_FIELDS,
  findUnknownTokens,
  findUsedKnownTokens,
  samplePlaceholderData,
  substituteMergeFieldsHtml,
  type ContractMergeField,
} from "@/lib/contracts/merge-fields";

const GROUP_ORDER: ContractMergeField["group"][] = [
  "Counterparty",
  "Signatory",
  "Dates",
  "Firm",
  "Links",
];

export function ContractTemplateEditor({
  template,
  open,
  onOpenChange,
}: {
  template?: ContractTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { upsertTemplate } = useContractFns();
  const editorRef = useRef<Editor | null>(null);

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [type, setType] = useState<ContractType>(template?.contract_type ?? "nda");
  const [status, setStatus] = useState<ContractTemplateStatus>(template?.status ?? "draft");
  const [jurisdiction, setJurisdiction] = useState(template?.jurisdiction ?? "");
  const [bodyHtml, setBodyHtml] = useState(template?.body_html ?? "");

  const usedFields = useMemo(() => findUsedKnownTokens(bodyHtml), [bodyHtml]);
  const unknownTokens = useMemo(() => findUnknownTokens(bodyHtml), [bodyHtml]);

  const previewHtml = useMemo(
    () => substituteMergeFieldsHtml(bodyHtml, samplePlaceholderData()),
    [bodyHtml],
  );

  function insertField(field: ContractMergeField) {
    const ed = editorRef.current;
    if (!ed) return;
    ed.chain().focus().insertContent(field.token).run();
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Template name is required");
      const bodyJson = (editorRef.current?.getJSON() ?? {}) as Record<string, unknown>;
      await upsertTemplate({
        data: {
          id: template?.id,
          name: name.trim(),
          description: description.trim() || null,
          contract_type: type,
          status,
          jurisdiction: jurisdiction.trim() || null,
          body_html: bodyHtml,
          body_json: bodyJson,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success(template ? "Template saved" : "Template created");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New contract template"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Template name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mutual NDA — Standard"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Contract type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ContractType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {CONTRACT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ContractTemplateStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Jurisdiction (default)</Label>
              <Input
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder="e.g. State of Delaware"
              />
            </div>
          </div>

          <Tabs defaultValue="edit">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger value="edit">Editor</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Braces className="mr-1 h-4 w-4" />
                    Insert merge field
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                  {GROUP_ORDER.map((group, gi) => {
                    const fields = CONTRACT_MERGE_FIELDS.filter((f) => f.group === group);
                    if (fields.length === 0) return null;
                    return (
                      <div key={group}>
                        {gi > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {group}
                        </DropdownMenuLabel>
                        {fields.map((f) => (
                          <DropdownMenuItem key={f.key} onSelect={() => insertField(f)}>
                            {f.label}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <TabsContent value="edit" className="mt-3">
              <RichEditor
                value={bodyHtml}
                onChange={setBodyHtml}
                onReady={(ed) => (editorRef.current = ed)}
                minHeight={340}
                placeholder="Draft your NDA / SLA. Use Insert merge field for {{counterparty}} values…"
              />
              <div className="mt-2 space-y-2">
                {usedFields.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Fields in use:</span>
                    {usedFields.map((f) => (
                      <Badge key={f.key} variant="secondary" className="font-normal">
                        {f.label}
                      </Badge>
                    ))}
                  </div>
                )}
                {unknownTokens.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Unknown tokens (won't be merged):
                    </span>
                    {unknownTokens.map((t) => (
                      <Badge
                        key={t}
                        variant="outline"
                        className="border-amber-300 font-normal text-amber-700"
                      >
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-3">
              <div className="rounded-md border bg-background p-6">
                {bodyHtml ? (
                  <RichViewer html={previewHtml} />
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Preview substitutes sample data. Real values are merged at generation time.
              </p>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !user}>
            {saveMut.isPending ? "Saving…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
