import { X, CornerUpLeft } from "lucide-react";

export interface QuoteTarget {
  id: string;
  body: string;
  authorName: string;
}

/** Pill shown above the composer when replying to a message. */
export function QuotedReplyPill({ quote, onClear }: { quote: QuoteTarget; onClear: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-xs">
      <CornerUpLeft className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium text-primary">Replying to {quote.authorName}</div>
        <div className="line-clamp-2 text-muted-foreground">{quote.body}</div>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Cancel reply"
        className="rounded p-0.5 hover:bg-background"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Inline quoted block shown inside a message that has reply_to_message_id. */
export function QuotedReplyBlock({
  body,
  authorName,
  onJump,
}: {
  body: string;
  authorName: string | null;
  onJump?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJump}
      className="block w-full text-left rounded border-l-2 border-primary/60 bg-background/40 px-2 py-1 mb-1 text-[11px] hover:bg-background/70 transition-colors"
    >
      <div className="font-medium opacity-80">{authorName ?? "Earlier message"}</div>
      <div className="line-clamp-2 opacity-70">{body}</div>
    </button>
  );
}
