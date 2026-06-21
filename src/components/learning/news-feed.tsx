import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pin, PinOff, Trash2, Newspaper } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { RichEditor, RichViewer } from "@/components/shared/rich-editor";
import { useAuth } from "@/lib/auth/auth-context";
import {
  useFirmId,
  learningNewsQuery,
  learningNewsAllQuery,
  type NewsPost,
} from "@/lib/queries/learning.queries";
import { createNewsPost, deleteNewsPost, togglePinNewsPost } from "@/lib/learning/news.functions";

export function NewsFeed() {
  const { role } = useAuth();
  const firmId = useFirmId();
  const isManager = !!role && ["admin", "super_admin", "hr_manager"].includes(role);

  const qc = useQueryClient();
  const newsQ = useQuery(isManager ? learningNewsAllQuery(firmId) : learningNewsQuery(firmId));

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteNewsPost({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-news"] });
      toast.success("Post deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pinMut = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      togglePinNewsPost({ data: { id, pinned } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-news"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const posts = newsQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Firm-wide announcements, tax law updates, and important notices.
        </p>
        {isManager && <CreatePostDialog firmId={firmId} />}
      </div>

      {newsQ.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-8 w-8" />}
          title="No announcements yet"
          description={
            isManager
              ? "Create the first post to keep your team informed."
              : "No announcements have been posted yet."
          }
        />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <NewsCard
              key={post.id}
              post={post}
              isManager={isManager}
              onPin={(pinned) => pinMut.mutate({ id: post.id, pinned })}
              onDelete={() => deleteMut.mutate(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NewsCard({
  post,
  isManager,
  onPin,
  onDelete,
}: {
  post: NewsPost;
  isManager: boolean;
  onPin: (pinned: boolean) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-lg border bg-card p-4 space-y-2 transition-colors ${post.pinned ? "border-primary/30 bg-primary/5" : ""}`}
    >
      <div className="flex items-start gap-3">
        <UserAvatar userId={post.author_id} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{post.title}</span>
            {post.pinned && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Pin className="h-2.5 w-2.5" /> Pinned
              </Badge>
            )}
            {!post.published_at && (
              <Badge variant="outline" className="text-[10px]">
                Draft
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {post.profiles?.full_name ?? "Staff"}
            </span>
            {post.published_at && (
              <span className="text-xs text-muted-foreground">
                · {formatDistanceToNow(new Date(post.published_at), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
        {isManager && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={post.pinned ? "Unpin" : "Pin"}
              onClick={() => onPin(!post.pinned)}
            >
              {post.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              title="Delete"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {post.content && (
        <div>
          <div className={expanded ? "" : "line-clamp-3"}>
            <RichViewer html={post.content ?? ""} />
          </div>
          {post.content.length > 200 && (
            <button
              className="text-xs text-primary mt-1 hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreatePostDialog({ firmId }: { firmId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);

  const mut = useMutation({
    mutationFn: () => {
      if (!firmId) throw new Error("Firm not loaded");
      return createNewsPost({ data: { firmId, title, content, pinned, publish: true } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-news"] });
      toast.success("Post published");
      setOpen(false);
      setTitle("");
      setContent("");
      setPinned(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Post
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Announcement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title…"
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Content</Label>
            <RichEditor
              value={content}
              onChange={setContent}
              placeholder="Write your announcement…"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="pin-toggle" checked={pinned} onCheckedChange={setPinned} />
            <Label htmlFor="pin-toggle" className="text-sm cursor-pointer">
              Pin this post
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!title.trim() || !firmId || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
