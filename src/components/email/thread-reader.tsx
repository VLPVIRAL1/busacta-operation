import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Paperclip, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getThread, markThreadRead } from "@/lib/email/threads.functions";
import type { ThreadMessage } from "@/lib/email/threads.functions";

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Renders sanitized HTML in a sandboxed iframe — no scripts, no
 *  same-origin access — and auto-sizes to content. */
function HtmlIframe({ html, allowImages }: { html: string; allowImages: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  const srcDoc = useMemo(() => {
    const body = allowImages
      ? html
      : html.replace(
          /<img\b[^>]*>/gi,
          '<span style="display:inline-block;padding:2px 6px;border:1px dashed #ccc;color:#888;font-size:11px;">image hidden</span>',
        );
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
      <style>
        html,body{margin:0;padding:8px 12px;font:13px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#fff;word-wrap:break-word;overflow-wrap:break-word;}
        img{max-width:100%;height:auto}
        a{color:#1d4ed8}
        blockquote{border-left:3px solid #e5e7eb;margin:0 0 0 4px;padding-left:10px;color:#555}
        table{max-width:100%;border-collapse:collapse}
        pre{white-space:pre-wrap}
      </style></head><body>${body}</body></html>`;
  }, [html, allowImages]);

  useEffect(() => {
    const i = ref.current;
    if (!i) return;
    const onLoad = () => {
      try {
        const doc = i.contentDocument;
        if (doc) setHeight(Math.min(2400, Math.max(120, doc.body.scrollHeight + 16)));
      } catch {
        /* sandboxed, ignore */
      }
    };
    i.addEventListener("load", onLoad);
    return () => i.removeEventListener("load", onLoad);
  }, [srcDoc]);

  return (
    <iframe
      ref={ref}
      sandbox=""
      srcDoc={srcDoc}
      title="Email body"
      style={{ width: "100%", height, border: "0", display: "block" }}
    />
  );
}

function MessageBlock({ m, defaultOpen }: { m: ThreadMessage; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showImages, setShowImages] = useState(false);
  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 hover:bg-muted text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {m.from_name || m.from_address || "Unknown sender"}
            {m.from_address && m.from_name && (
              <span className="text-muted-foreground font-normal"> &lt;{m.from_address}&gt;</span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            to {m.to_addresses.map((a) => a.address).join(", ") || "—"}
            {m.cc_addresses.length > 0 &&
              ` · cc ${m.cc_addresses.map((a) => a.address).join(", ")}`}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {m.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground" />}
          <span className="text-[11px] tabular-nums text-muted-foreground">{fmt(m.sent_at)}</span>
        </div>
      </button>
      {open && (
        <div className="bg-background">
          {m.body_html ? (
            <>
              <div className="flex items-center justify-end px-3 py-1.5 border-b bg-muted/20">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setShowImages((v) => !v)}
                >
                  {showImages ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showImages ? "Hide images" : "Show images"}
                </Button>
              </div>
              <HtmlIframe html={m.body_html} allowImages={showImages} />
            </>
          ) : (
            <pre className="whitespace-pre-wrap text-sm p-4 font-sans">
              {m.body_text || "(no body)"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ThreadReader({ threadId }: { threadId: string | null }) {
  const getThreadFn = useServerFn(getThread);
  const markReadFn = useServerFn(markThreadRead);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["email", "thread", threadId],
    queryFn: () => getThreadFn({ data: { threadId: threadId! } }),
    enabled: !!threadId,
  });

  // Auto mark-read when a thread opens
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data || !threadId) return;
    if (markedRef.current === threadId) return;
    if (data.thread.unread_count === 0) {
      markedRef.current = threadId;
      return;
    }
    markedRef.current = threadId;
    markReadFn({ data: { threadId, isRead: true } })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["email", "threads"] });
      })
      .catch(() => undefined);
  }, [data, threadId, markReadFn, queryClient]);

  if (!threadId) {
    return (
      <div className="h-full grid place-items-center text-sm text-muted-foreground p-6">
        Select a message to read it here.
      </div>
    );
  }
  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading thread…</div>;
  }
  if (isError) {
    return (
      <div className="p-4 text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load thread."}
      </div>
    );
  }
  if (!data) return null;

  const { thread, messages } = data;
  return (
    <div className="h-full flex flex-col min-h-0">
      <header className="px-4 py-3 border-b space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold leading-snug min-w-0 break-words">
            {thread.subject || "(no subject)"}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
          <span>
            {thread.message_count} message{thread.message_count === 1 ? "" : "s"}
          </span>
          {thread.has_attachments && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" /> attachments
            </span>
          )}
          {thread.linked_count > 0 && (
            <span className="inline-flex items-center gap-1 text-primary/80">
              <Link2 className="h-3 w-3" /> {thread.linked_count} linked
            </span>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((m, i) => (
          <MessageBlock key={m.id} m={m} defaultOpen={i === messages.length - 1} />
        ))}
      </div>
    </div>
  );
}
