/**
 * Live preview panel — renders the current template as a PDF data URL in an iframe.
 * Regenerates with 800ms debounce after any template/field change.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderPdfDataUrl } from "@/lib/pdf-templates/renderer";
import { SAMPLE_DATA } from "@/lib/pdf-templates/sample-data";
import type { PdfTemplate, PdfTemplateField } from "@/lib/pdf-templates/schemas";

interface Props {
  template: PdfTemplate;
  fields: PdfTemplateField[];
}

export function PdfPreviewPanel({ template, fields }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationKey = JSON.stringify({ template, fields });
  const prevKeyRef = useRef<string>("");

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const sampleData = SAMPLE_DATA[template.doc_type] ?? SAMPLE_DATA.financial_report;
      const url = await renderPdfDataUrl(template, fields, sampleData);
      setDataUrl(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (generationKey === prevKeyRef.current) return;
    prevKeyRef.current = generationKey;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void generate();
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationKey]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
        <span className="text-xs font-medium text-muted-foreground">Live Preview</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => void generate()}
          disabled={loading}
          title="Refresh preview"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-hidden relative bg-muted/20">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-xs text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void generate()}>
              Retry
            </Button>
          </div>
        )}

        {!error && dataUrl && (
          <iframe src={dataUrl} className="w-full h-full border-0" title="PDF Preview" />
        )}

        {!error && !dataUrl && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <p className="text-xs">Add fields to see a preview</p>
            <Button variant="outline" size="sm" onClick={() => void generate()}>
              <RefreshCw className="h-3.5 w-3.5" /> Generate Preview
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
