import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Save, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getGeminiConfig,
  saveGeminiConfig,
  testGeminiConfig,
  type GeminiAdminConfig,
} from "@/lib/gemini/gemini-config.functions";

type FormState = {
  api_key: string;
  tier: "free" | "paid";
  model: "gemini-2.5-flash" | "gemini-2.5-flash-lite";
  max_input_chars: number;
  is_active: boolean;
};

const EMPTY: FormState = {
  api_key: "",
  tier: "paid",
  model: "gemini-2.5-flash",
  max_input_chars: 8000,
  is_active: false,
};

export const Route = createFileRoute("/admin/gemini-integration")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/integration", search: { tab: "gemini" } });
  },
});

export function GeminiSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
    <div className="grid max-w-3xl gap-4">
      <CredentialsCard />
    </div>
  );
  return embedded ? body : <div className="p-4">{body}</div>;
}

function CredentialsCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getGeminiConfig);
  const saveFn = useServerFn(saveGeminiConfig);
  const testFn = useServerFn(testGeminiConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "gemini", "config"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [keyHint, setKeyHint] = useState("");

  useEffect(() => {
    if (data) {
      setForm({
        api_key: "",
        tier: data.tier,
        model: data.model,
        max_input_chars: data.max_input_chars,
        is_active: data.is_active,
      });
      setKeyHint(data.api_key_hint);
      setDirty(false);
    }
  }, [data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const isConfigured = !!keyHint || !!form.api_key;

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          api_key: form.api_key || undefined,
          tier: form.tier,
          model: form.model,
          max_input_chars: form.max_input_chars,
          is_active: form.is_active,
        },
      }),
    onSuccess: () => {
      toast.success("Gemini settings saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "gemini"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => testFn(),
    onSuccess: (res) => {
      if (res.ok) toast.success(`Connection OK — Gemini detected "${res.detected ?? "—"}"`);
      else toast.error(`Test failed: ${(res as { ok: false; error: string }).error}`);
      qc.invalidateQueries({ queryKey: ["admin", "gemini", "config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = (data as GeminiAdminConfig | null)?.last_test_status;

  if (isLoading) return <Skeleton className="h-80" />;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Sparkles className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Google Gemini API</CardTitle>
        <div className="ml-auto flex items-center gap-2">
          {form.is_active ? (
            <Badge variant="default" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Enabled
            </Badge>
          ) : (
            <Badge variant="secondary">Disabled</Badge>
          )}
          {status === "ok" && (
            <Badge variant="outline" className="gap-1 text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> Last test OK
            </Badge>
          )}
          {status === "failed" && (
            <Badge variant="outline" className="gap-1 text-destructive">
              <AlertTriangle className="h-3 w-3" /> Last test failed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gemini classifies documents the rule engine and local ML can&apos;t resolve, seeding
          training data. Create an API key in{" "}
          <span className="font-medium text-foreground">Google AI Studio</span> and paste it below.
          The key is stored securely server-side and never exposed to the browser.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="API Key"
            hint={
              keyHint
                ? "Leave blank to keep the saved key"
                : "From aistudio.google.com → Get API key"
            }
            className="sm:col-span-2"
          >
            <Input
              type="password"
              value={form.api_key}
              onChange={(e) => set("api_key", e.target.value)}
              placeholder={keyHint || "AIza…"}
            />
          </Field>

          <Field label="Model" hint="flash-lite is cheaper; flash is more accurate">
            <Select value={form.model} onValueChange={(v) => set("model", v as FormState["model"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-2.5-flash">gemini-2.5-flash</SelectItem>
                <SelectItem value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Tier" hint="Free tier may use your data for Google model training">
            <Select value={form.tier} onValueChange={(v) => set("tier", v as FormState["tier"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Paid (billed per token)</SelectItem>
                <SelectItem value="free">Free ($0 — not for client data)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Max input characters"
            hint="Safety cap on text sent per document (1000–32000)"
            className="sm:col-span-2"
          >
            <Input
              type="number"
              min={1000}
              max={32000}
              value={form.max_input_chars}
              onChange={(e) => set("max_input_chars", Number(e.target.value))}
            />
          </Field>
        </div>

        {form.tier === "free" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              On the free tier Google may use submitted documents for model training. Use the paid
              tier in production with real client data.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between rounded-md border border-border-subtle p-3">
          <div>
            <Label className="text-sm">Enable Gemini fallback</Label>
            <p className="text-xs text-muted-foreground">
              When enabled, documents the rules and local ML can&apos;t classify are sent to Gemini.
            </p>
          </div>
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => set("is_active", v)}
            disabled={!isConfigured && !form.is_active}
          />
        </div>

        {(data as GeminiAdminConfig | null)?.last_test_error && status === "failed" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <div className="mb-1 font-medium">Last test error</div>
            <code className="break-all">{(data as GeminiAdminConfig).last_test_error}</code>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={!isConfigured || test.isPending || dirty}
            title={dirty ? "Save changes before testing" : undefined}
          >
            <RefreshCw className={`h-4 w-4 ${test.isPending ? "animate-spin" : ""}`} />
            {test.isPending ? "Testing…" : "Test connection"}
          </Button>
          {(data as GeminiAdminConfig | null)?.last_tested_at && (
            <span className="text-xs text-muted-foreground">
              Last tested {new Date((data as GeminiAdminConfig).last_tested_at!).toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5${className ? ` ${className}` : ""}`}>
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
