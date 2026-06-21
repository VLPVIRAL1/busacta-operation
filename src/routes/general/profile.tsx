import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Download, Monitor } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarUploader } from "@/components/shared/avatar-uploader";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { useAuth } from "@/lib/auth/auth-context";
import { profileSelfQuery, updateProfileSelf } from "@/lib/queries/profile.queries";
import { CaptchaBlock, useCaptchaGate } from "@/components/auth/captcha-confirm";
import { useCommPrefs } from "@/lib/ops/communication.queries";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const Route = createFileRoute("/general/profile")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "My Profile" }]}>
        <ProfilePage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const captcha = useCaptchaGate(user?.id);

  const { data, isLoading } = useQuery(profileSelfQuery(user?.id));
  const commPrefs = useCommPrefs();
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);

  const [form, setForm] = useState<{
    full_name: string;
    phone: string;
    specialty: string;
    avatar_url: string | null;
  }>({
    full_name: "",
    phone: "",
    specialty: "",
    avatar_url: null,
  });

  useEffect(() => {
    if (data) {
      setForm({
        full_name: data.full_name ?? "",
        phone: (data as { phone?: string | null }).phone ?? "",
        specialty: (data as { specialty?: string | null }).specialty ?? "",
        avatar_url: (data as { avatar_url?: string | null }).avatar_url ?? null,
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await updateProfileSelf(user.id, {
        full_name: form.full_name.trim() || null,
        phone: form.phone.trim() || null,
        specialty: form.specialty.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Profile saved");
      captcha.reset();
      qc.invalidateQueries({ queryKey: ["profile-self", user?.id] });
      qc.invalidateQueries({ queryKey: ["profile-lite", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="My Profile"
        description="Update your photo and contact details. Visible to teammates and clients."
      />
      <Card className="max-w-2xl">
        <CardContent className="p-6 space-y-6">
          {isLoading || !user ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <AvatarUploader
                userId={user.id}
                currentUrl={form.avatar_url}
                onUploaded={(url) => setForm((f) => ({ ...f, avatar_url: url }))}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Full name</Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={data?.email ?? ""} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Specialty / role</Label>
                  <Input
                    value={form.specialty}
                    onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                    placeholder="e.g. Senior Tax Reviewer"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => save.mutate()} disabled={save.isPending || !captcha.valid}>
                  <Save className="h-4 w-4 mr-1.5" />
                  {save.isPending ? "Saving…" : "Save profile"}
                </Button>
              </div>
              <CaptchaBlock
                captchaKey={captcha.nonce}
                onValidChange={captcha.setValid}
                label="Solve this captcha before saving profile edits."
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl mt-6">
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Desktop app</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Download the BusAcTa Tracker desktop widget for Windows, macOS, or Linux.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              <a
                href="https://github.com/VLPVIRAL1/busacta-one/releases/latest/download/BusAcTa-Tracker-Setup-1.0.0.exe"
                download
              >
                <Monitor className="mr-2 h-4 w-4" />
                Windows (.exe)
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://github.com/VLPVIRAL1/busacta-one/releases/latest/download/BusAcTa-Tracker.dmg"
                download
              >
                <Download className="mr-2 h-4 w-4" />
                macOS (.dmg)
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://github.com/VLPVIRAL1/busacta-one/releases/latest/download/BusAcTa-Tracker.AppImage"
                download
              >
                <Download className="mr-2 h-4 w-4" />
                Linux (.AppImage)
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            All releases are available on{" "}
            <a
              href="https://github.com/VLPVIRAL1/busacta-one/releases"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              GitHub Releases
            </a>
            .
          </p>
        </CardContent>
      </Card>

      <Card className="max-w-2xl mt-6">
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold">Communication preferences</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Chats with no activity for the selected period are moved to Archived. A new message
              automatically restores them to your inbox.
            </p>
          </div>
          {commPrefs.isLoading || !commPrefs.data ? (
            <Skeleton className="h-24" />
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Enable auto-archive</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically archive inactive conversations.
                  </p>
                </div>
                <Switch
                  checked={commPrefs.data.comm_auto_archive_enabled}
                  disabled={commPrefs.save.isPending}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      setConfirmDisableOpen(true);
                      return;
                    }
                    commPrefs.save.mutate({ comm_auto_archive_enabled: true });
                  }}
                />
                <AlertDialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disable auto-archive?</AlertDialogTitle>
                      <AlertDialogDescription>
                        New inactive conversations will no longer be archived automatically.
                        Existing archived conversations stay archived until you restore them.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => commPrefs.save.mutate({ comm_auto_archive_enabled: false })}
                      >
                        Disable
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Auto-archive after</Label>
                  <p className="text-xs text-muted-foreground">
                    Period of inactivity before a chat is archived.
                  </p>
                </div>
                <Select
                  value={String(commPrefs.data.comm_auto_archive_days)}
                  disabled={!commPrefs.data.comm_auto_archive_enabled || commPrefs.save.isPending}
                  onValueChange={(v) =>
                    commPrefs.save.mutate({ comm_auto_archive_days: Number(v) })
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[7, 14, 30, 60, 90, 180].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
