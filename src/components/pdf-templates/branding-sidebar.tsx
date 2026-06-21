import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadTemplateLogo } from "@/lib/pdf-templates/logo-upload";
import { updateTemplateFn } from "@/lib/pdf-templates/functions";
import type { PdfTemplate } from "@/lib/pdf-templates/schemas";

const FONT_OPTIONS = [
  { value: "Helvetica", label: "Helvetica (Sans-serif)" },
  { value: "Times", label: "Times New Roman (Serif)" },
  { value: "Courier", label: "Courier (Monospace)" },
];

interface Props {
  template: PdfTemplate;
}

export function BrandingSidebar({ template }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const updateFn = useServerFn(updateTemplateFn);

  const saveMut = useMutation({
    mutationFn: async (patch: Partial<PdfTemplate>) => {
      await updateFn({ data: { id: template.id, ...patch } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pdf-templates", "detail", template.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadTemplateLogo(template.id, file);
      saveMut.mutate({ logo_storage_path: path });
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="p-3 space-y-4 border-b border-border/50">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Branding
      </p>

      {/* Logo */}
      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground">Logo</Label>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleLogoUpload} />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3 w-3" />
            {uploading ? "Uploading…" : "Upload"}
          </Button>
          {template.logo_storage_path && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => saveMut.mutate({ logo_storage_path: null })}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          {template.logo_storage_path && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
              {template.logo_storage_path.split("/").pop()}
            </span>
          )}
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Primary color</Label>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              className="h-6 w-8 rounded border border-input cursor-pointer p-0.5"
              defaultValue={template.primary_color}
              onChange={(e) => saveMut.mutate({ primary_color: e.target.value })}
            />
            <Input
              className="h-6 text-[10px] font-mono px-1.5"
              defaultValue={template.primary_color}
              onBlur={(e) => saveMut.mutate({ primary_color: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Accent color</Label>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              className="h-6 w-8 rounded border border-input cursor-pointer p-0.5"
              defaultValue={template.secondary_color}
              onChange={(e) => saveMut.mutate({ secondary_color: e.target.value })}
            />
            <Input
              className="h-6 text-[10px] font-mono px-1.5"
              defaultValue={template.secondary_color}
              onBlur={(e) => saveMut.mutate({ secondary_color: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Font */}
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Font family</Label>
        <Select
          value={template.font_family}
          onValueChange={(v) => saveMut.mutate({ font_family: v })}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((f) => (
              <SelectItem key={f.value} value={f.value} className="text-xs">
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Page margins */}
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Margins (pt)</Label>
        <div className="grid grid-cols-4 gap-1">
          {(["margin_top", "margin_right", "margin_bottom", "margin_left"] as const).map((k) => (
            <div key={k} className="space-y-0.5">
              <span className="text-[9px] text-muted-foreground">
                {k.replace("margin_", "").slice(0, 1).toUpperCase()}
              </span>
              <Input
                type="number"
                className="h-6 text-[10px] px-1.5"
                defaultValue={Number(template[k])}
                onBlur={(e) => saveMut.mutate({ [k]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
