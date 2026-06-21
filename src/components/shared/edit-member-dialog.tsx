import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AvatarUploader } from "@/components/shared/avatar-uploader";
import { supabase } from "@/integrations/supabase/client";
import { CaptchaBlock, useCaptchaGate } from "@/components/auth/captcha-confirm";

const POSITION_OPTIONS = [
  { value: "partner", label: "Partner" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
  { value: "reviewer", label: "Reviewer" },
  { value: "preparer", label: "Preparer" },
  { value: "client_contact", label: "Client contact" },
  { value: "other", label: "Other" },
];

const DEPARTMENT_OPTIONS = [
  { value: "none", label: "—" },
  { value: "ops", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "hr", label: "Human Resources" },
  { value: "exec", label: "Executive" },
];

export interface MemberProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  position: string | null;
  specialty: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string | null;
  department: string | null;
}

export function EditMemberDialog({ profile }: { profile: MemberProfile }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(profile);
  const captcha = useCaptchaGate(profile.id);

  useEffect(() => {
    setForm(profile);
    captcha.reset();
  }, [profile, open]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name?.trim() || null,
          position: (form.position ?? "other") as never,
          specialty: form.specialty?.trim() || null,
          phone: form.phone?.trim() || null,
          avatar_url: form.avatar_url?.trim() || null,
          status: form.status || "active",
          department: form.department && form.department !== "none" ? form.department : null,
        } as never)
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
      qc.invalidateQueries({ queryKey: ["team-members"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
          <Pencil className="h-3 w-3" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit team member</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input
              value={form.full_name ?? ""}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Select
                value={form.position ?? "other"}
                onValueChange={(v) => setForm({ ...form, position: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status ?? "active"}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select
              value={form.department ?? "none"}
              onValueChange={(v) => setForm({ ...form, department: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Controls visibility of Finance / HR mega-menus for non-admin staff.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Specialty</Label>
            <Input
              placeholder="e.g. 1120-S returns, QBO cleanups, sales tax for SaaS…"
              value={form.specialty ?? ""}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Profile photo</Label>
            <AvatarUploader
              userId={profile.id}
              currentUrl={form.avatar_url}
              onUploaded={(url) => setForm({ ...form, avatar_url: url })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Email <span className="font-mono">{profile.email}</span> can't be changed here.
          </p>
          <CaptchaBlock
            captchaKey={captcha.nonce}
            onValidChange={captcha.setValid}
            label="Solve this captcha before saving user/profile edits."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !captcha.valid}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
