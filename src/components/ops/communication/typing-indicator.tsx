import type { TypingUser } from "@/lib/ops/comm-realtime";

export function TypingIndicator({ typers }: { typers: TypingUser[] }) {
  if (typers.length === 0) return null;
  const names =
    typers.length === 1
      ? `${typers[0].name} is typing`
      : typers.length === 2
        ? `${typers[0].name} and ${typers[1].name} are typing`
        : `${typers.length} people are typing`;
  return (
    <div className="px-4 py-1 text-[11px] text-muted-foreground italic flex items-center gap-1.5">
      <span className="inline-flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" />
      </span>
      {names}…
    </div>
  );
}
