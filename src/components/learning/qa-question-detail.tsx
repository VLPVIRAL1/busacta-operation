import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useAuth } from "@/lib/auth/auth-context";
import { learningAnswersQuery, type LearningQuestion } from "@/lib/queries/learning.queries";
import { createAnswer, markAnswerAccepted } from "@/lib/learning/qa.functions";

export function QaQuestionDetail({ question }: { question: LearningQuestion }) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isManager = !!role && ["admin", "super_admin", "hr_manager"].includes(role);
  const canAccept = isManager || question.asker_id === user?.id;

  const answersQ = useQuery(learningAnswersQuery(question.id));
  const [reply, setReply] = useState("");

  const replyMut = useMutation({
    mutationFn: () => createAnswer({ data: { questionId: question.id, body: reply } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-answers", question.id] });
      qc.invalidateQueries({ queryKey: ["learning-questions"] });
      toast.success("Answer posted");
      setReply("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceptMut = useMutation({
    mutationFn: (answerId: string) =>
      markAnswerAccepted({ data: { answerId, questionId: question.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-answers", question.id] });
      qc.invalidateQueries({ queryKey: ["learning-questions"] });
      toast.success("Answer accepted — question marked resolved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const answers = answersQ.data ?? [];

  return (
    <div className="space-y-4 py-2">
      {/* Question body */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <UserAvatar userId={question.asker_id} size="sm" />
          <span className="text-sm font-medium">{question.profiles?.full_name ?? "Staff"}</span>
          <span className="text-xs text-muted-foreground">
            · {formatDistanceToNow(new Date(question.created_at), { addSuffix: true })}
          </span>
          {question.is_resolved && (
            <Badge className="text-[10px] gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3" /> Resolved
            </Badge>
          )}
        </div>
        {question.body && (
          <p className="text-sm text-foreground whitespace-pre-wrap">{question.body}</p>
        )}
      </div>

      {/* Answers */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          <MessageSquare className="h-3.5 w-3.5" />
          {answers.length} {answers.length === 1 ? "Answer" : "Answers"}
        </div>

        {answersQ.isLoading ? (
          <Skeleton className="h-20" />
        ) : (
          answers.map((ans) => (
            <div
              key={ans.id}
              className={`rounded-md border p-3 space-y-2 ${ans.is_accepted ? "border-emerald-500/40 bg-emerald-500/5" : ""}`}
            >
              <div className="flex items-start gap-2">
                <UserAvatar userId={ans.author_id} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {ans.profiles?.full_name ?? "Staff"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {formatDistanceToNow(new Date(ans.created_at), { addSuffix: true })}
                    </span>
                    {ans.is_accepted && (
                      <Badge className="text-[10px] gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                        <CheckCircle2 className="h-3 w-3" /> Accepted
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{ans.body}</p>
                </div>
                {canAccept && !ans.is_accepted && !question.is_resolved && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs h-7 gap-1"
                    disabled={acceptMut.isPending}
                    onClick={() => acceptMut.mutate(ans.id)}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Accept
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reply form */}
      {!question.is_resolved && (
        <div className="space-y-2 pt-2 border-t">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write an answer…"
            className="min-h-[80px] text-sm resize-none"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!reply.trim() || replyMut.isPending}
              onClick={() => replyMut.mutate()}
            >
              {replyMut.isPending ? "Posting…" : "Post Answer"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
