import { useState } from "react";
import { Zap, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useQuickReplies,
  useSaveQuickReply,
  useDeleteQuickReply,
} from "@/lib/ops/comm-quick-replies";

export function QuickRepliesMenu({ onInsert }: { onInsert: (body: string) => void }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const { data: replies = [] } = useQuickReplies();
  const save = useSaveQuickReply();
  const del = useDeleteQuickReply();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Quick replies">
          <Zap className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold">Quick replies</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1 text-[10px]"
            onClick={() => setCreating((v) => !v)}
          >
            <Plus className="h-3 w-3 mr-0.5" /> New
          </Button>
        </div>

        {creating && (
          <div className="space-y-1.5 mb-2 p-2 border rounded-md bg-muted/30">
            <Input
              placeholder="Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-7 text-xs"
            />
            <Textarea
              placeholder="Message body…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="text-xs"
            />
            <div className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                onClick={() => {
                  setCreating(false);
                  setLabel("");
                  setBody("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 text-[11px]"
                disabled={!label.trim() || !body.trim() || save.isPending}
                onClick={async () => {
                  await save.mutateAsync({ label, body });
                  setLabel("");
                  setBody("");
                  setCreating(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {replies.length === 0 ? (
            <div className="text-[11px] text-muted-foreground p-2 text-center">
              No quick replies yet. Save common messages to reuse them.
            </div>
          ) : (
            replies.map((r) => (
              <div
                key={r.id}
                className="group flex items-center gap-1 rounded hover:bg-muted px-1.5 py-1"
              >
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => {
                    onInsert(r.body);
                    setOpen(false);
                  }}
                >
                  <div className="text-xs font-medium truncate">{r.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{r.body}</div>
                </button>
                <button
                  type="button"
                  onClick={() => del.mutate(r.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
