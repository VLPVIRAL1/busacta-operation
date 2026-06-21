import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Calendar,
  CheckSquare,
  CircleDot,
  FileText,
  Mail,
  PenLine,
  Type as TypeIcon,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getEnvelopeOverview } from "@/lib/esign/envelopes.functions";
import { listFields } from "@/lib/esign/builder.functions";
import type { FieldType } from "@/lib/esign/schemas";
import { LazyPdfPage } from "./lazy-pdf-page";
import type { PageSize } from "./pdf-page";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  signature: PenLine,
  initials: PenLine,
  date_signed: Calendar,
  name: User,
  email: Mail,
  text: TypeIcon,
  checkbox: CheckSquare,
  radio: CircleDot,
};

type DocSummary = { id: string; name: string; source_path: string };

type PreviewField = {
  id?: string;
  document_id: string;
  recipient_id: string;
  field_type: FieldType;
  page_index: number;
  x_pt: number;
  y_pt: number;
  width_pt: number;
  height_pt: number;
  is_required: boolean;
};

export function ReviewPreview({ envelopeId }: { envelopeId: string }) {
  const overview = useServerFn(getEnvelopeOverview);
  const listFn = useServerFn(listFields);
  const ovQ = useQuery({
    queryKey: ["esign", "envelope", envelopeId],
    queryFn: () => overview({ data: { envelope_id: envelopeId } }),
  });
  const fieldsQ = useQuery({
    queryKey: ["esign", "fields", envelopeId],
    queryFn: () => listFn({ data: { envelope_id: envelopeId } }),
  });

  const documents = (ovQ.data?.documents ?? []) as DocSummary[];
  const recipients = ovQ.data?.recipients ?? [];
  const fields = (fieldsQ.data?.fields ?? []) as PreviewField[];

  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!activeDocId && documents.length > 0) setActiveDocId(documents[0].id);
  }, [documents, activeDocId]);

  useEffect(() => {
    if (!activeDocId) return;
    const doc = documents.find((d) => d.id === activeDocId);
    if (!doc) return;
    setPdfUrl(null);
    setPageSizes({});
    setTotalPages(1);
    setActivePage(0);
    (async () => {
      const { data, error } = await supabase.storage
        .from("esign-source")
        .createSignedUrl(doc.source_path, 3600);
      if (error) return;
      setPdfUrl(data.signedUrl);
    })();
  }, [activeDocId, documents]);

  // IntersectionObserver to surface the active page indicator in real time.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || totalPages === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1;
        let bestRatio = 0;
        for (const e of entries) {
          if (e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio;
            const idx = Number((e.target as HTMLElement).dataset.pageIndex);
            if (!Number.isNaN(idx)) bestIdx = idx;
          }
        }
        if (bestIdx >= 0) setActivePage(bestIdx);
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );
    for (const el of pageRefs.current.values()) io.observe(el);
    return () => io.disconnect();
  }, [totalPages, pdfUrl]);

  const recipientById = useMemo(() => {
    const m = new Map<string, { color_hex: string; full_name: string }>();
    for (const r of recipients) m.set(r.id, { color_hex: r.color_hex, full_name: r.full_name });
    return m;
  }, [recipients]);

  const fieldsPerDoc = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fields) m.set(f.document_id, (m.get(f.document_id) ?? 0) + 1);
    return m;
  }, [fields]);

  const fieldsByPage = useMemo(() => {
    const m = new Map<number, PreviewField[]>();
    for (const f of fields) {
      if (f.document_id !== activeDocId) continue;
      const list = m.get(f.page_index) ?? [];
      list.push(f);
      m.set(f.page_index, list);
    }
    return m;
  }, [fields, activeDocId]);

  const requiredSignersWithoutFields = useMemo(() => {
    const signersWithField = new Set(fields.map((f) => f.recipient_id));
    return recipients.filter((r) => r.role === "signer" && !signersWithField.has(r.id));
  }, [recipients, fields]);

  if (ovQ.isLoading || fieldsQ.isLoading) return <Skeleton className="h-96 w-full" />;

  if (documents.length === 0 || fields.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium">No fields placed</div>
            <div className="text-xs text-muted-foreground">
              Go back and place at least one signature, initials, or date field before previewing.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Sidebar — document list + field summary */}
      <Card className="self-start">
        <CardContent className="p-3 space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase mb-1.5">
              Documents
            </div>
            <ul className="space-y-1">
              {documents.map((d) => {
                const count = fieldsPerDoc.get(d.id) ?? 0;
                const active = d.id === activeDocId;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setActiveDocId(d.id)}
                      className={
                        "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors " +
                        (active ? "bg-primary/10 text-primary" : "hover:bg-muted")
                      }
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{d.name}</span>
                      <Badge variant={count > 0 ? "secondary" : "outline"} className="text-[10px]">
                        {count}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase mb-1.5">
              Recipients
            </div>
            <ul className="space-y-1">
              {recipients.map((r) => {
                const count = fields.filter((f) => f.recipient_id === r.id).length;
                return (
                  <li key={r.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: r.color_hex }}
                    />
                    <span className="truncate flex-1">{r.full_name}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          {requiredSignersWithoutFields.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-destructive">Signers without fields</div>
                <div className="text-muted-foreground mt-0.5">
                  {requiredSignersWithoutFields.map((r) => r.full_name).join(", ")}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Continuous-scroll preview canvas */}
      <Card>
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b flex items-center justify-between text-xs text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">
              Page {Math.min(activePage + 1, Math.max(totalPages, 1))}
              <span className="text-muted-foreground font-normal">
                {" "}
                of {Math.max(totalPages, 1)}
              </span>
            </span>
            <span>Scroll to scan every placement</span>
          </div>
          <div ref={scrollRef} className="h-[70vh] overflow-y-auto bg-muted/30 p-4 space-y-6">
            {pdfUrl ? (
              Array.from({ length: totalPages }).map((_, pageIndex) => {
                const sz = pageSizes[pageIndex];
                const pageFields = fieldsByPage.get(pageIndex) ?? [];
                return (
                  <div
                    key={`${activeDocId}-${pageIndex}`}
                    ref={(el) => {
                      if (el) pageRefs.current.set(pageIndex, el);
                      else pageRefs.current.delete(pageIndex);
                    }}
                    data-page-index={pageIndex}
                    className="relative mx-auto bg-white shadow-2xl border border-slate-200/60 rounded-sm"
                    style={{
                      width: sz?.width ?? 720,
                      maxWidth: "100%",
                    }}
                  >
                    <LazyPdfPage
                      url={pdfUrl}
                      pageIndex={pageIndex}
                      eager={pageIndex === 0}
                      renderWidth={720}
                      reservedSize={sz}
                      onReady={(total, size) => {
                        if (pageIndex === 0) setTotalPages(total);
                        setPageSizes((prev) =>
                          prev[pageIndex]?.width === size.width &&
                          prev[pageIndex]?.height === size.height
                            ? prev
                            : { ...prev, [pageIndex]: size },
                        );
                      }}
                    />
                    {sz && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ width: sz.width, height: sz.height }}
                      >
                        {pageFields.map((f, i) => {
                          const r = recipientById.get(f.recipient_id);
                          const color = r?.color_hex ?? "#4f46e5";
                          const Icon = ICON[f.field_type] ?? TypeIcon;
                          return (
                            <div
                              key={f.id ?? i}
                              className="absolute rounded-sm border-2 flex items-center gap-1 px-1 text-[10px] font-medium shadow-sm"
                              style={{
                                left: f.x_pt * sz.width,
                                top: f.y_pt * sz.height,
                                width: f.width_pt * sz.width,
                                height: f.height_pt * sz.height,
                                borderColor: color,
                                backgroundColor: `${color}22`,
                                color,
                              }}
                              title={`${f.field_type.replace("_", " ")} · ${r?.full_name ?? "?"}`}
                            >
                              <Icon className="h-3 w-3 shrink-0" />
                              <span className="truncate">{f.field_type.replace("_", " ")}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div
                      className="absolute top-1 left-2 text-[10px] text-muted-foreground/70 pointer-events-none select-none"
                      aria-hidden
                    >
                      Page {pageIndex + 1}
                    </div>
                  </div>
                );
              })
            ) : (
              <Skeleton className="h-[600px] w-[720px] mx-auto" />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
