import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInboxData, useInboxAggregates } from "@/lib/ops/communication.queries";
import { useInboxRealtime } from "@/lib/ops/comm-realtime";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * Header pill: total unread across DMs, Groups, and Task chats.
 * Click jumps to /ops/communication.
 */
export function ChatUnreadBadge() {
  const { user } = useAuth();
  const { rows } = useInboxData("mine");
  const { totalUnread } = useInboxAggregates(rows);

  // Keep the badge live without remounting the inbox page.
  useInboxRealtime(user?.id ?? null);

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={totalUnread > 0 ? `${totalUnread} unread messages` : "Messages"}
    >
      <Link to="/ops/communication">
        <MessageCircle className="h-4 w-4" />
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </Link>
    </Button>
  );
}
