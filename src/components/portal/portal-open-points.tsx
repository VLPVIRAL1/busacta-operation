import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { RichViewer } from "@/components/shared/rich-editor";
import { useAuth } from "@/lib/auth/auth-context";
import {
  addOpenPointReply,
  portalOpenPointsQuery,
  type PortalOpenPoint,
} from "@/lib/queries/portal.queries";

type Props = { firmId: string };

const STATUS_TONE: Record<PortalOpenPoint["status"], "default" | "secondary" | "outline"> = {
  open: "outline",
  answered: "secondary",
  resolved: "default",
};

const STATUS_LABEL: Record<PortalOpenPoint["status"], string> = {
  open: "Awaiting your reply",
  answered: "You replied",
  resolved: "Resolved",
};

function OpenPointCard({ point, firmId }: { point: PortalOpenPoint; firmId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      await addOpenPointReply(point.id, user.id, reply.trim());
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["portal", "open-points", firmId] });
      toast.success("Reply sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="glass border-border-subtle">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 font-medium">{point.title}</div>
          <Badge variant={STATUS_TONE[point.status]} className="shrink-0">
            {STATUS_LABEL[point.status]}
          </Badge>
        </div>
        {point.body && (
          <div className="text-sm text-muted-foreground">
            <RichViewer html={point.body} />
          </div>
        )}

        {point.open_point_replies.length > 0 && (
          <ul className="space-y-2 border-l-2 border-border pl-3">
            {point.open_point_replies.map((r) => (
              <li key={r.id} className="text-sm">
                <div className="whitespace-pre-wrap break-words">{r.body}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}

        {point.status !== "resolved" && (
          <div className="flex items-end gap-2">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type your reply…"
              rows={2}
              className="text-sm"
            />
            <Button
              size="sm"
              disabled={!reply.trim() || send.isPending}
              onClick={() => send.mutate()}
            >
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Client-facing open points: read the firm's questions and reply inline. */
export function PortalOpenPoints({ firmId }: Props) {
  const { data, isLoading } = useQuery(portalOpenPointsQuery(firmId));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="h-10 w-10" />}
        title="Nothing pending"
        description="When your accountant raises a question, it'll show up here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {data.map((p) => (
        <OpenPointCard key={p.id} point={p} firmId={firmId} />
      ))}
    </div>
  );
}
