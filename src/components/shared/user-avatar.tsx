import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";
import { PresenceDot } from "@/components/ops/communication/presence-dot";

export interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

const sizeClasses: Record<string, string> = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-7 w-7 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-14 w-14 text-base",
};

export function initialsFor(p?: ProfileLite | null) {
  const src = p?.full_name?.trim() || p?.email?.trim() || "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

// Display-name helpers (`profileLabel`, `buildProfileLabelMap`) live in the pure
// module `@/lib/shared/profile-name` so both client components and server
// `*.functions.ts` modules can reuse them. Import them from there directly.

/** Cached single-profile lookup. Reuses one query key across the app. */
export function useProfileLite(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["profile-lite", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<ProfileLite | null> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("id", userId!)
        .maybeSingle();
      return (data as ProfileLite | null) ?? null;
    },
  });
}

interface UserAvatarProps {
  userId?: string | null;
  profile?: ProfileLite | null;
  size?: keyof typeof sizeClasses;
  className?: string;
  showName?: boolean;
  /** Set false to suppress the presence dot (e.g. dense table avatars). Defaults to true. */
  showPresence?: boolean;
}

export function UserAvatar({
  userId,
  profile,
  size = "md",
  className,
  showName,
  showPresence = true,
}: UserAvatarProps) {
  const { data: fetched } = useProfileLite(profile ? null : userId);
  const p = profile ?? fetched ?? null;
  const initials = initialsFor(p);
  const name = p?.full_name || p?.email || "Unknown";
  const id = p?.id ?? userId ?? null;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative inline-flex">
        <Avatar className={sizeClasses[size]}>
          {p?.avatar_url ? <AvatarImage src={p.avatar_url} alt={name} /> : null}
          <AvatarFallback className="bg-primary/10 text-primary font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        {showPresence && id && <PresenceDot userId={id} />}
      </span>
      {showName && <span className="truncate text-xs text-foreground">{name}</span>}
    </span>
  );
}
