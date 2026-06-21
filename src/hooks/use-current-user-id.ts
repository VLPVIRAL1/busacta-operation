import { useAuth } from "@/lib/auth/auth-context";

/**
 * Returns the current authenticated user's id.
 *
 * Must be called inside an `<AuthGuard>` subtree — by that point auth has
 * resolved and `user` is non-null. Throws otherwise so callers don't have
 * to sprinkle `user!.id` non-null assertions everywhere.
 */
export function useCurrentUserId(): string {
  const { user, loading } = useAuth();
  if (loading) {
    // AuthGuard renders its own loading state, so consumers shouldn't reach
    // this path. If they do, throwing is safer than returning a stale id.
    throw new Error("useCurrentUserId called before auth resolved — wrap in <AuthGuard>");
  }
  if (!user) {
    throw new Error("useCurrentUserId called without an authenticated user — wrap in <AuthGuard>");
  }
  return user.id;
}
