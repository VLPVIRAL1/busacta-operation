import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Save } from "lucide-react";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/lib/shared/branding";

export const Route = createFileRoute("/admin/branding")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/settings", search: { tab: "branding" } });
  },
});

export function BrandingPage({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const branding = useBranding();
  const [name, setName] = useState(branding.name);
  const [tagline, setTagline] = useState(branding.tagline);
  const [mark, setMark] = useState(branding.mark);
  const [logoUrl, setLogoUrl] = useState(branding.logo_url);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("app_settings").upsert({
        id: "branding",
        value: { name, tagline, mark, logo_url: logoUrl },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Branding saved");
      qc.invalidateQueries({ queryKey: ["branding"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
      const path = `logo-${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      toast.success("Logo uploaded — click Save to apply");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      {!embedded && (
        <PageHeader title="Branding" description="Update workspace logo, name and tagline." />
      )}
      <Card className="max-w-2xl glass border-border-subtle">
        <CardHeader>
          <CardTitle className="text-base">Workspace identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="h-16 w-16 rounded-md object-cover border" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xl">
                {mark}
              </div>
            )}
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload logo"}
              </Button>
              {logoUrl && (
                <Button variant="ghost" onClick={() => setLogoUrl(null)}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Workspace name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tagline</Label>
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Logo fallback (2–3 letters)</Label>
            <Input
              maxLength={3}
              value={mark}
              onChange={(e) => setMark(e.target.value.toUpperCase())}
              className="w-24"
            />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
