import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, UserPlus, Image as ImageIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PeoplePicker } from "@/components/shared/people-picker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

interface GroupRow {
  id: string;
  name: string | null;
  avatar_url: string | null;
  notes: string | null;
}
interface MemberRow {
  user_id: string;
  role: string;
}
interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export function GroupInfoDrawer({
  threadId,
  open,
  onOpenChange,
}: {
  threadId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [picker, setPicker] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const groupQ = useQuery({
    queryKey: ["group-info", threadId],
    enabled: !!threadId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("id,name,avatar_url,notes")
        .eq("id", threadId!)
        .single();
      if (error) throw error;
      return data as GroupRow;
    },
  });

  const membersQ = useQuery({
    queryKey: ["group-members", threadId],
    enabled: !!threadId && open,
    queryFn: async () => {
      const { data: mems } = await supabase
        .from("chat_thread_members")
        .select("user_id,role")
        .eq("thread_id", threadId!);
      const list = (mems ?? []) as MemberRow[];
      if (list.length === 0) return { members: list, profiles: {} as Record<string, ProfileLite> };
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,full_name,email,avatar_url")
        .in(
          "id",
          list.map((m) => m.user_id),
        );
      const map: Record<string, ProfileLite> = {};
      for (const p of (profs ?? []) as ProfileLite[]) map[p.id] = p;
      return { members: list, profiles: map };
    },
  });

  useEffect(() => {
    if (groupQ.data) {
      setName(groupQ.data.name ?? "");
      setNotes(groupQ.data.notes ?? "");
    }
  }, [groupQ.data]);

  const isOwner = (membersQ.data?.members ?? []).some(
    (m) => m.user_id === user?.id && m.role === "owner",
  );

  const saveGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("chat_threads")
        .update({ name: name.trim() || null, notes: notes.trim() || null })
        .eq("id", threadId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Group saved");
      qc.invalidateQueries({ queryKey: ["group-info", threadId] });
      qc.invalidateQueries({ queryKey: ["inbox", "threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("chat_thread_members")
        .delete()
        .eq("thread_id", threadId!)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-members", threadId] });
      qc.invalidateQueries({ queryKey: ["inbox", "threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMembers = useMutation({
    mutationFn: async () => {
      if (picker.length === 0) return;
      const rows = picker.map((uid) => ({
        thread_id: threadId!,
        user_id: uid,
        role: "member",
      }));
      const { error } = await supabase
        .from("chat_thread_members")
        .upsert(rows, { onConflict: "thread_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      setPicker([]);
      qc.invalidateQueries({ queryKey: ["group-members", threadId] });
      qc.invalidateQueries({ queryKey: ["inbox", "threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onAvatarFile = async (file: File) => {
    if (!threadId) return;
    setUploading(true);
    try {
      const path = `group/${threadId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error } = await supabase
        .from("chat_threads")
        .update({ avatar_url: pub.publicUrl })
        .eq("id", threadId);
      if (error) throw error;
      toast.success("Avatar updated");
      qc.invalidateQueries({ queryKey: ["group-info", threadId] });
      qc.invalidateQueries({ queryKey: ["inbox", "threads"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Group info</SheetTitle>
          <SheetDescription>Manage group details, members, and notes.</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-16 w-16">
              {groupQ.data?.avatar_url && <AvatarImage src={groupQ.data.avatar_url} />}
              <AvatarFallback className="bg-primary/15 text-primary text-lg">
                {(name || "G").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <label className="text-xs text-primary cursor-pointer flex items-center gap-1 hover:underline">
              <ImageIcon className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : "Change avatar"}
              <input
                type="file"
                accept="image/*"
                disabled={!isOwner || uploading}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAvatarFile(f);
                }}
              />
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isOwner}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-notes">Group notes</Label>
            <Textarea
              id="group-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              disabled={!isOwner}
              placeholder="Pinned notes for the group (visible to all members)…"
            />
          </div>

          {isOwner && (
            <Button size="sm" onClick={() => saveGroup.mutate()} disabled={saveGroup.isPending}>
              Save changes
            </Button>
          )}

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Members ({membersQ.data?.members.length ?? 0})</Label>
            </div>
            <ul className="space-y-1.5">
              {(membersQ.data?.members ?? []).map((m) => {
                const p = membersQ.data?.profiles[m.user_id];
                return (
                  <li
                    key={m.user_id}
                    className="flex items-center gap-2 rounded-md border px-2 py-1.5"
                  >
                    <Avatar className="h-7 w-7">
                      {p?.avatar_url && <AvatarImage src={p.avatar_url} />}
                      <AvatarFallback className="text-[10px]">
                        {(p?.full_name || p?.email || "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {p?.full_name || p?.email || "Unknown"}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{p?.email}</div>
                    </div>
                    {m.role === "owner" && (
                      <Badge variant="outline" className="text-[9px]">
                        owner
                      </Badge>
                    )}
                    {isOwner && m.user_id !== user?.id && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive"
                        onClick={() => removeMember.mutate(m.user_id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {isOwner && (
            <div className="space-y-2 border-t pt-4">
              <Label className="flex items-center gap-1">
                <UserPlus className="h-3.5 w-3.5" /> Add participants
              </Label>
              <PeoplePicker value={picker} onChange={setPicker} />
              <Button
                size="sm"
                disabled={picker.length === 0 || addMembers.isPending}
                onClick={() => addMembers.mutate()}
              >
                Add {picker.length || ""}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
