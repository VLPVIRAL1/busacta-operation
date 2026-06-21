import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichViewer } from "@/components/shared/rich-editor";
import {
  contractProfilesQuery,
  contractTemplatesQuery,
  useContractFns,
} from "@/lib/queries/contracts.queries";
import { CONTRACT_TYPE_LABELS, type ContractDocFormat } from "@/lib/contracts/schemas";
import { buildMergeData, substituteMergeFieldsHtml } from "@/lib/contracts/merge-fields";
import { generateDocx, generatePdf } from "@/lib/contracts/generate";

type FormatChoice = "docx" | "pdf" | "both";

function safeFile(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim() || "contract";
}

export function GenerateContractDialog() {
  const qc = useQueryClient();
  const { getProfileMergeBundle, recordDocument } = useContractFns();

  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [format, setFormat] = useState<FormatChoice>("both");

  const profilesQ = useQuery(contractProfilesQuery());
  const templatesQ = useQuery(contractTemplatesQuery());

  const profile = useMemo(
    () => (profilesQ.data ?? []).find((p) => p.id === profileId),
    [profilesQ.data, profileId],
  );
  const template = useMemo(
    () => (templatesQ.data ?? []).find((t) => t.id === templateId),
    [templatesQ.data, templateId],
  );

  // Default the template list to the selected profile's contract type.
  const eligibleTemplates = useMemo(() => {
    const all = templatesQ.data ?? [];
    if (!profile) return all;
    const matching = all.filter((t) => t.contract_type === profile.contract_type);
    return matching.length > 0 ? matching : all;
  }, [templatesQ.data, profile]);

  const bundleQ = useQuery({
    queryKey: ["contract-merge-bundle", profileId],
    queryFn: () => getProfileMergeBundle({ data: { id: profileId } }),
    enabled: !!profileId && open,
    staleTime: 30 * 1000,
  });

  const mergeData = useMemo(() => {
    if (!bundleQ.data) return null;
    const b = bundleQ.data;
    return buildMergeData(
      b.profile,
      { leadCompany: b.leadCompany, campaignName: b.campaignName },
      { firmName: b.firmName },
    );
  }, [bundleQ.data]);

  const previewHtml = useMemo(() => {
    if (!template || !mergeData) return "";
    return substituteMergeFieldsHtml(template.body_html, mergeData);
  }, [template, mergeData]);

  const genMut = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Select a contract profile");
      if (!template) throw new Error("Select a template");
      if (!mergeData) throw new Error("Profile data is still loading");

      const title = `${template.name} — ${profile.registered_legal_name}`;
      const fileBase = safeFile(title);
      const formats: ContractDocFormat[] = format === "both" ? ["docx", "pdf"] : [format];

      for (const fmt of formats) {
        if (fmt === "docx") {
          await generateDocx(template.body_json, mergeData, title);
        } else {
          generatePdf(template.body_json, mergeData, title);
        }
        await recordDocument({
          data: {
            template_id: template.id,
            template_name: template.name,
            profile_id: profile.id,
            profile_name: profile.registered_legal_name,
            contract_type: template.contract_type,
            output_format: fmt,
            file_name: `${fileBase}.${fmt}`,
          },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-documents"] });
      toast.success("Document generated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Sparkles className="mr-1 h-4 w-4" />
          Generate document
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Generate contract document</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Contract profile</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select profile…" />
                </SelectTrigger>
                <SelectContent>
                  {(profilesQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.registered_legal_name} · {CONTRACT_TYPE_LABELS[p.contract_type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template…" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {CONTRACT_TYPE_LABELS[t.contract_type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5 sm:max-w-xs">
            <Label>Output format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as FormatChoice)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Word + PDF</SelectItem>
                <SelectItem value="docx">Word (.docx)</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Preview</Label>
            <div className="rounded-md border bg-background p-6">
              {!template || !profile ? (
                <p className="text-sm text-muted-foreground">
                  Select a profile and template to preview the merged document.
                </p>
              ) : bundleQ.isLoading || !mergeData ? (
                <p className="text-sm text-muted-foreground">Loading profile data…</p>
              ) : previewHtml ? (
                <RichViewer html={previewHtml} />
              ) : (
                <p className="text-sm text-muted-foreground">This template has no content yet.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            onClick={() => genMut.mutate()}
            disabled={genMut.isPending || !profile || !template || !mergeData}
          >
            <FileDown className="mr-1 h-4 w-4" />
            {genMut.isPending ? "Generating…" : "Generate & download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
