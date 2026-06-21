import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";
import { UserAvatar } from "@/components/shared/user-avatar";

export interface MentionUser {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

/**
 * Textarea that supports @mention autocomplete against the HR employee profiles.
 * Returns the plain text (with @name tokens) plus accumulated mention IDs via
 * onMentionsChange so callers can send notifications.
 */
export function MentionTextarea({
  value,
  onChange,
  onMentionsChange,
  placeholder,
  rows = 3,
  className,
  disabled,
  id,
  onKeyDown,
  autoGrow = false,
  menuPlacement = "bottom",
}: {
  value: string;
  onChange: (next: string) => void;
  onMentionsChange?: (ids: string[]) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  id?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  autoGrow?: boolean;
  menuPlacement?: "top" | "bottom";
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [mentionedUsers, setMentionedUsers] = useState<MentionUser[]>([]);
  // Accumulated mention IDs — grows as users are selected, never shrinks
  // (false-positive notifications are harmless; false-negatives miss a mention).
  const mentionedIdsRef = useRef(new Set<string>());

  const { data: people } = useQuery({
    queryKey: ["mention-people-hr"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("status", "active")
        .eq("provisioned_via" as never, "hr_hub" as never)
        .order("full_name", { ascending: true })
        .limit(200);
      return (data ?? []) as MentionUser[];
    },
    staleTime: 60_000,
  });

  const matches = useMemo(() => {
    if (query == null) return [];
    const q = query.toLowerCase();
    return (people ?? [])
      .filter(
        (p) =>
          (p.full_name ?? "").toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [query, people]);

  // Sync autogrow
  const autoGrowRef = useRef(autoGrow);
  autoGrowRef.current = autoGrow;
  const syncHeight = () => {
    if (!autoGrowRef.current) return;
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const handleChange = (raw: string) => {
    onChange(raw);
    syncHeight();
    const cursor = ref.current?.selectionStart ?? raw.length;
    const before = raw.slice(0, cursor);
    const m = before.match(/(?:^|[\s,;:(])@([\w.\-]*)$/);
    if (m) {
      setQuery(m[1] ?? "");
      setActiveIdx(0);
    } else {
      setQuery(null);
    }
  };

  const insertMention = (u: MentionUser) => {
    const el = ref.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const m = before.match(/(?:^|[\s,;:(])@([\w.\-]*)$/);
    if (!m) return;
    const start = cursor - (m[1].length + 1); // include the @
    const label = u.full_name || u.email || "user";
    // Store just "@name" — clean, readable, no UUID visible
    const token = `@${label} `;
    const next = value.slice(0, start) + token + after;
    onChange(next);
    setQuery(null);
    // Track the ID for notification firing
    mentionedIdsRef.current.add(u.id);
    onMentionsChange?.(Array.from(mentionedIdsRef.current));
    setMentionedUsers((prev) => (prev.some((p) => p.id === u.id) ? prev : [...prev, u]));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
      syncHeight();
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (query == null || matches.length === 0) {
      onKeyDown?.(e);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(matches[activeIdx]);
    } else if (e.key === "Escape") {
      setQuery(null);
    } else {
      onKeyDown?.(e);
    }
  };

  return (
    <div className={cn("relative", autoGrow && "flex-1")}>
      <Textarea
        id={id}
        ref={ref}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder ?? "Write something… use @ to mention"}
        rows={rows}
        className={cn("resize-y", className)}
        disabled={disabled}
      />
      {query != null && matches.length > 0 && (
        <div
          className={cn(
            "absolute z-30 left-2 w-72 rounded-md border bg-popover p-1 shadow-md",
            menuPlacement === "top" ? "bottom-full mb-1" : "mt-1",
          )}
        >
          {matches.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertMention(u)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                i === activeIdx && "bg-accent",
              )}
            >
              <UserAvatar
                profile={{
                  id: u.id,
                  full_name: u.full_name,
                  email: u.email,
                  avatar_url: u.avatar_url,
                }}
                size="xs"
                className="shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {u.full_name || u.email || "User"}
                </span>
                {u.full_name && u.email && (
                  <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      {mentionedUsers.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {mentionedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-accent/50 py-0.5 pl-0.5 pr-2 text-xs text-accent-foreground"
            >
              <UserAvatar
                profile={{
                  id: u.id,
                  full_name: u.full_name,
                  email: u.email,
                  avatar_url: u.avatar_url,
                }}
                size="xs"
                className="shrink-0"
              />
              {u.full_name || u.email || "User"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Render text containing @[name](uuid) mentions (legacy format) as styled spans. */
export function renderMentioned(text: string, onMentionClick?: (userId: string) => void) {
  const parts: Array<string | { kind: "mention"; label: string; id: string }> = [];
  const re = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ kind: "mention", label: m[1], id: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) => {
    if (typeof p === "string") return <span key={i}>{p}</span>;
    const className = "rounded bg-primary/10 px-1 py-0.5 text-primary font-medium";
    if (onMentionClick) {
      return (
        <button
          key={i}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMentionClick(p.id);
          }}
          className={`${className} hover:bg-primary/20 cursor-pointer`}
        >
          @{p.label}
        </button>
      );
    }
    return (
      <span key={i} className={className}>
        @{p.label}
      </span>
    );
  });
}
