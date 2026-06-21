import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Pencil, Type, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/shared/utils";
import type { SignatureAnswer, SignatureConfig } from "@/lib/organizer/schemas";

const BUCKET = "organizer-uploads";

interface Props {
  deploymentId: string;
  blockId: string;
  value: unknown;
  disabled?: boolean;
  onChange: (v: SignatureAnswer) => void;
  config: Partial<SignatureConfig> & Record<string, unknown>;
}

/**
 * Signature pad. Two modes:
 *  - "drawn": canvas → uploads PNG to `organizer-uploads/{deploymentId}/{blockId}/sig-{ts}.png`.
 *  - "typed": user types full legal name (rendered in script font for confirmation).
 *
 * Storage path is small; the PNG never travels through JSON.
 */
export function SignatureField({
  deploymentId,
  blockId,
  value,
  disabled,
  onChange,
  config,
}: Props) {
  const allowDrawn = config.allowDrawn !== false;
  const allowTyped = config.allowTyped !== false;
  const current =
    value && typeof value === "object" && "kind" in value ? (value as SignatureAnswer) : null;

  const [mode, setMode] = useState<"drawn" | "typed">(
    current?.kind ?? (allowDrawn ? "drawn" : "typed"),
  );
  const [typedName, setTypedName] = useState(current?.typedName ?? "");
  const [storagePath, setStoragePath] = useState(current?.storagePath ?? "");
  const [signedUrl, setSignedUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const padRef = useRef<SignatureCanvas | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!storagePath) {
        setSignedUrl("");
        return;
      }
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 600);
      if (!cancel && data?.signedUrl) setSignedUrl(data.signedUrl);
    })();
    return () => {
      cancel = true;
    };
  }, [storagePath]);

  const saveDrawn = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      toast.error("Please draw your signature first");
      return;
    }
    setSaving(true);
    try {
      const dataUrl = padRef.current.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${deploymentId}/${blockId}/sig-${Date.now()}.png`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: "image/png",
        upsert: true,
      });
      if (error) throw error;
      setStoragePath(path);
      onChange({ kind: "drawn", storagePath: path, signedAt: new Date().toISOString() });
      toast.success("Signature saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const clearDrawn = () => {
    padRef.current?.clear();
    if (storagePath) {
      setStoragePath("");
      onChange({ kind: "drawn", storagePath: "", signedAt: new Date().toISOString() });
    }
  };

  const saveTyped = () => {
    const name = typedName.trim();
    if (!name) {
      toast.error("Enter your full legal name");
      return;
    }
    onChange({ kind: "typed", typedName: name, signedAt: new Date().toISOString() });
  };

  return (
    <div className="space-y-3 rounded-md border bg-card p-3">
      {allowDrawn && allowTyped ? (
        <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5 w-fit">
          <Button
            type="button"
            variant={mode === "drawn" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("drawn")}
            disabled={disabled}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" /> Draw
          </Button>
          <Button
            type="button"
            variant={mode === "typed" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("typed")}
            disabled={disabled}
          >
            <Type className="mr-1 h-3.5 w-3.5" /> Type
          </Button>
        </div>
      ) : null}

      {mode === "drawn" && allowDrawn && (
        <div className="space-y-2">
          {signedUrl ? (
            <img
              src={signedUrl}
              alt="Saved signature"
              className="max-h-32 rounded border bg-white p-2"
            />
          ) : (
            <div className="rounded border bg-white">
              <SignatureCanvas
                ref={padRef}
                penColor="#111827"
                canvasProps={{
                  className: "w-full h-32 cursor-crosshair",
                  "aria-label": "Signature pad",
                }}
              />
            </div>
          )}
          <div className="flex gap-2">
            {!signedUrl ? (
              <Button type="button" size="sm" onClick={saveDrawn} disabled={disabled || saving}>
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Save signature
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearDrawn}
              disabled={disabled || saving}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
      )}

      {mode === "typed" && allowTyped && (
        <div className="space-y-2">
          <Input
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            onBlur={saveTyped}
            placeholder="Your full legal name"
            disabled={disabled}
            maxLength={120}
          />
          {typedName.trim() ? (
            <div
              className={cn("rounded border bg-white px-3 py-2 text-2xl text-foreground")}
              style={{ fontFamily: "'Brush Script MT','Lucida Handwriting',cursive" }}
            >
              {typedName.trim()}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            By typing your name you confirm this constitutes your legal signature.
          </p>
        </div>
      )}

      {current?.signedAt ? (
        <p className="text-xs text-muted-foreground">
          Signed {new Date(current.signedAt).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}
