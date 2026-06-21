import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Building2, User, Pin, PinOff, Archive, Trash2, GripVertical } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import {
  togglePinClient,
  setClientStatus,
  deleteClient,
} from "@/lib/clients/user-client-prefs.functions";
import type { UnifiedClient } from "@/lib/queries/unified-clients.queries";

interface Props {
  client: UnifiedClient;
  active: boolean;
  onSelect: () => void;
}

export function ClientRow({ client, active, onSelect }: Props) {
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${client.stream}:${client.id}`,
  });

  const isDirect = client.stream === "direct";
  const Icon = isDirect ? User : Building2;
  const isOff = ["deactivated", "inactive", "archived"].includes(client.status);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["unified-clients", "list"] });

  const pinMut = useMutation({
    mutationFn: (pinned: boolean) =>
      togglePinClient({ data: { stream: client.stream, clientId: client.id, pinned } }),
    onSuccess: () => {
      invalidate();
      toast.success(client.pinned ? "Unpinned" : "Pinned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: () =>
      setClientStatus({ data: { stream: client.stream, clientId: client.id, status: "archived" } }),
    onSuccess: () => {
      invalidate();
      toast.success("Archived");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: () => deleteClient({ data: { stream: client.stream, clientId: client.id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Deleted");
      setConfirmDel(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setNodeRef}
            style={style}
            className={cn(
              "group relative rounded-md border-l-2 transition-colors",
              "border-y border-r border-transparent hover:bg-primary/5",
              active
                ? isDirect
                  ? "bg-rose-500/10 border-l-rose-500 border-y-rose-500/30 border-r-rose-500/30"
                  : "bg-sky-500/10 border-l-sky-500 border-y-sky-500/30 border-r-sky-500/30"
                : isDirect
                  ? "border-l-rose-400/50"
                  : "border-l-sky-400/50",
            )}
          >
            <button type="button" onClick={onSelect} className="w-full text-left pl-2 pr-16 py-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isDirect
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-sky-600 dark:text-sky-400",
                  )}
                />
                {client.code && (
                  <span className="font-mono text-[9px] text-muted-foreground shrink-0">
                    [{client.code}]
                  </span>
                )}
                <span className="text-xs font-medium truncate flex-1">{client.name}</span>
                {client.pinned && <Pin className="h-3 w-3 text-amber-500 shrink-0" />}
                {isOff && (
                  <Badge variant="destructive" className="text-[9px] h-4 px-1">
                    off
                  </Badge>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground truncate mt-0.5 ml-5">
                {client.contact || "—"}
              </div>
            </button>

            {/* Hover action cluster */}
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity bg-background/90 backdrop-blur rounded-sm">
              <RowIcon
                title={client.pinned ? "Unpin" : "Pin to top"}
                onClick={(e) => {
                  e.stopPropagation();
                  pinMut.mutate(!client.pinned);
                }}
              >
                {client.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </RowIcon>
              <RowIcon
                title="Archive"
                onClick={(e) => {
                  e.stopPropagation();
                  archiveMut.mutate();
                }}
              >
                <Archive className="h-3 w-3" />
              </RowIcon>
              <RowIcon
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDel(true);
                }}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </RowIcon>
              <button
                type="button"
                {...attributes}
                {...listeners}
                title="Drag to reorder"
                aria-label="Drag to reorder"
                className="h-6 w-6 grid place-items-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="h-3 w-3" />
              </button>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onSelect={() => pinMut.mutate(!client.pinned)}>
            {client.pinned ? (
              <>
                <PinOff className="h-3.5 w-3.5 mr-2" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="h-3.5 w-3.5 mr-2" />
                Pin to top
              </>
            )}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => archiveMut.mutate()}>
            <Archive className="h-3.5 w-3.5 mr-2" />
            Archive
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => setConfirmDel(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {isDirect ? "B2C client" : "firm"} and may fail if
              related records exist. Consider archiving instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                delMut.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RowIcon({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-6 w-6"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
