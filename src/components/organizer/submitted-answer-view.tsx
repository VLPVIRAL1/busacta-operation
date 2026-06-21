import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBytes } from "@/lib/format/format-bytes";
import { RichTextViewer } from "@/components/organizer/fields/rich-text-viewer";
import type { BlockType } from "@/lib/organizer/schemas";

const BUCKET = "organizer-uploads";

interface Props {
  blockType: BlockType;
  config: Record<string, unknown> | null | undefined;
  value: unknown;
}

/**
 * Renders a stored organizer answer in read-only form for the admin review page
 * and printed/PDF exports. Knows how to render rich-text, signatures, matrix
 * grids, and multi-file lists in addition to scalar answers.
 */
export function SubmittedAnswerView({ blockType, config, value }: Props) {
  if (value === null || value === undefined || value === "") {
    return <EmptyAnswer />;
  }

  switch (blockType) {
    case "rich_text":
    case "long_text":
      return <RichTextViewer value={value} />;

    case "signature":
      return <SignaturePreview value={value} />;

    case "file_upload": {
      const path =
        value && typeof value === "object" && "path" in value
          ? String((value as { path: unknown }).path ?? "")
          : typeof value === "string"
            ? value
            : "";
      const name =
        value && typeof value === "object" && "name" in value
          ? String((value as { name: unknown }).name ?? path)
          : path;
      return path ? <FileLink path={path} name={name} /> : <EmptyAnswer />;
    }

    case "multi_file":
    case "attachment_request": {
      const files =
        value && typeof value === "object" && "files" in value
          ? ((value as { files: unknown }).files as Array<{
              path: string;
              name?: string;
              size?: number;
            }>)
          : [];
      if (!Array.isArray(files) || files.length === 0) return <EmptyAnswer />;
      return (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.path}-${i}`}>
              <FileLink path={f.path} name={f.name ?? f.path} size={f.size} />
            </li>
          ))}
        </ul>
      );
    }

    case "matrix":
      return <MatrixPreview config={config} value={value} />;

    case "yes_no":
      return <span className="text-sm">{value ? "Yes" : "No"}</span>;

    case "single_choice":
    case "multi_choice": {
      if (Array.isArray(value)) return <span className="text-sm">{value.join(", ")}</span>;
      return <span className="text-sm">{String(value)}</span>;
    }

    case "address": {
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        const parts = [v.line1, v.line2, v.city, v.state, v.postalCode, v.country]
          .filter(Boolean)
          .map(String);
        return <span className="text-sm whitespace-pre-wrap">{parts.join(", ")}</span>;
      }
      return <span className="text-sm">{String(value)}</span>;
    }

    case "date_range": {
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        return (
          <span className="text-sm">
            {String(v.from ?? "—")} → {String(v.to ?? "—")}
          </span>
        );
      }
      return <span className="text-sm">{String(value)}</span>;
    }

    case "table": {
      if (Array.isArray(value)) {
        return (
          <pre className="text-xs whitespace-pre-wrap font-mono">
            {JSON.stringify(value, null, 2)}
          </pre>
        );
      }
      return <span className="text-sm">{String(value)}</span>;
    }

    default: {
      if (typeof value === "string" || typeof value === "number") {
        return <span className="text-sm whitespace-pre-wrap break-words">{String(value)}</span>;
      }
      if (typeof value === "boolean")
        return <span className="text-sm">{value ? "Yes" : "No"}</span>;
      return (
        <pre className="text-xs whitespace-pre-wrap font-mono">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }
  }
}

function EmptyAnswer() {
  return <span className="text-sm italic text-muted-foreground">No answer</span>;
}

function SignaturePreview({ value }: { value: unknown }) {
  const v =
    value && typeof value === "object" && "kind" in value
      ? (value as { kind: string; storagePath?: string; typedName?: string; signedAt?: string })
      : null;
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    let cancel = false;
    if (v?.kind === "drawn" && v.storagePath) {
      supabase.storage
        .from(BUCKET)
        .createSignedUrl(v.storagePath, 60 * 10)
        .then(({ data }) => {
          if (!cancel) setUrl(data?.signedUrl ?? "");
        });
    }
    return () => {
      cancel = true;
    };
  }, [v?.kind, v?.storagePath]);

  if (!v) return <EmptyAnswer />;
  if (v.kind === "typed") {
    return (
      <div className="space-y-1">
        <div className="text-2xl font-serif italic">{v.typedName}</div>
        {v.signedAt && (
          <div className="text-[11px] text-muted-foreground">
            Signed {new Date(v.signedAt).toLocaleString()}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {url ? (
        <img src={url} alt="Signature" className="max-h-32 rounded border bg-white p-2" />
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
          Loading signature…
        </div>
      )}
      {v.signedAt && (
        <div className="text-[11px] text-muted-foreground">
          Signed {new Date(v.signedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function FileLink({ path, name, size }: { path: string; name: string; size?: number }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let cancel = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 10)
      .then(({ data }) => {
        if (!cancel) setUrl(data?.signedUrl ?? "");
      });
    return () => {
      cancel = true;
    };
  }, [path]);
  return (
    <a
      href={url || "#"}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
    >
      <FileText className="h-4 w-4" />
      <span>{name}</span>
      {typeof size === "number" && (
        <span className="text-xs text-muted-foreground">({formatBytes(size)})</span>
      )}
      {url && <Download className="h-3 w-3 opacity-60" />}
    </a>
  );
}

function MatrixPreview({
  config,
  value,
}: {
  config: Record<string, unknown> | null | undefined;
  value: unknown;
}) {
  const rows = (config?.rows as Array<{ id: string; label: string }> | undefined) ?? [];
  const columns =
    (config?.columns as Array<{ id: string; label: string; value: string }> | undefined) ?? [];
  const selections =
    value && typeof value === "object" && "selections" in value
      ? ((value as { selections: Record<string, string | string[]> }).selections ?? {})
      : {};
  if (rows.length === 0 || columns.length === 0) {
    return (
      <pre className="text-xs whitespace-pre-wrap font-mono">{JSON.stringify(value, null, 2)}</pre>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-muted/50">
            <th className="border-b p-2 text-left font-medium" />
            {columns.map((c) => (
              <th key={c.id} className="border-b p-2 text-center font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const sel = selections[r.id];
            return (
              <tr key={r.id}>
                <th scope="row" className="border-b p-2 text-left font-normal">
                  {r.label}
                </th>
                {columns.map((c) => {
                  const checked = Array.isArray(sel) ? sel.includes(c.value) : sel === c.value;
                  return (
                    <td key={c.id} className="border-b p-2 text-center text-muted-foreground">
                      {checked ? "✓" : ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
