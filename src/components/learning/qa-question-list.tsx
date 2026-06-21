import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, HelpCircle, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAvatar } from "@/components/shared/user-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/auth-context";
import { type LearningQuestion } from "@/lib/queries/learning.queries";
import { QaQuestionDetail } from "./qa-question-detail";
import { createQuestion, deleteQuestion } from "@/lib/learning/qa.functions";

interface Course {
  id: string;
  title: string;
}

interface Props {
  questions: LearningQuestion[];
  isLoading: boolean;
  firmId: string | null;
  courses: Course[];
  search: string;
  onSearchChange: (v: string) => void;
  courseFilter: string;
  onCourseFilterChange: (v: string) => void;
  resolvedFilter: "all" | "open" | "resolved";
  onResolvedFilterChange: (v: "all" | "open" | "resolved") => void;
}

export function QaQuestionList({
  questions,
  isLoading,
  firmId,
  courses,
  search,
  onSearchChange,
  courseFilter,
  onCourseFilterChange,
  resolvedFilter,
  onResolvedFilterChange,
}: Props) {
  const { role } = useAuth();
  const isManager = !!role && ["admin", "super_admin", "hr_manager"].includes(role);
  const qc = useQueryClient();
  const [selectedQuestion, setSelectedQuestion] = useState<LearningQuestion | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteQuestion({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-questions"] });
      toast.success("Question deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search questions…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 text-sm w-48"
        />
        <Select value={courseFilter} onValueChange={onCourseFilterChange}>
          <SelectTrigger className="h-8 text-sm w-40">
            <SelectValue placeholder="All courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={resolvedFilter}
          onValueChange={(v) => onResolvedFilterChange(v as "all" | "open" | "resolved")}
        >
          <SelectTrigger className="h-8 text-sm w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Unanswered</SelectItem>
            <SelectItem value="resolved">Knowledge Bank</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {firmId && (
          <AskQuestionDialog firmId={firmId} courses={courses} courseFilter={courseFilter} />
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <EmptyState
          icon={<HelpCircle className="h-8 w-8" />}
          title={resolvedFilter === "resolved" ? "No resolved questions yet" : "No questions yet"}
          description="Be the first to ask a question."
        />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead className="w-28">Asked by</TableHead>
                <TableHead className="w-24 text-center">Answers</TableHead>
                <TableHead className="w-20">Status</TableHead>
                <TableHead className="w-24 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((q) => (
                <TableRow
                  key={q.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedQuestion(q)}
                >
                  <TableCell>
                    <div className="font-medium text-sm">{q.title}</div>
                    {q.course_id && (
                      <div className="text-xs text-muted-foreground">
                        {courses.find((c) => c.id === q.course_id)?.title}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <UserAvatar userId={q.asker_id} size="sm" />
                      <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                        {q.profiles?.full_name ?? "Staff"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 text-sm">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      {q.learning_answers?.length ?? 0}
                    </div>
                  </TableCell>
                  <TableCell>
                    {q.is_resolved ? (
                      <Badge className="text-[10px] gap-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Resolved
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Open
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {isManager && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteMut.mutate(q.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail sheet */}
      <Sheet
        open={!!selectedQuestion}
        onOpenChange={(o) => {
          if (!o) setSelectedQuestion(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedQuestion && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="text-base leading-snug">{selectedQuestion.title}</SheetTitle>
              </SheetHeader>
              <QaQuestionDetail question={selectedQuestion} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AskQuestionDialog({
  firmId,
  courses,
  courseFilter,
}: {
  firmId: string;
  courses: Course[];
  courseFilter: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [courseId, setCourseId] = useState(courseFilter !== "all" ? courseFilter : "");

  const mut = useMutation({
    mutationFn: () =>
      createQuestion({
        data: {
          firmId,
          courseId: courseId || null,
          title,
          body,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-questions"] });
      toast.success("Question posted");
      setOpen(false);
      setTitle("");
      setBody("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ask a Question
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ask a Question</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Question</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want to know?"
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Details (optional)</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Provide context or details…"
              className="min-h-[80px] text-sm resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Related course (optional)</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!title.trim() || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Posting…" : "Post Question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
