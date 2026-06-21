import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { CaptchaBlock, useCaptchaGate } from "@/components/auth/captcha-confirm";
import { AvatarCropDialog } from "@/components/shared/avatar-crop-dialog";

interface AvatarUploaderProps {
  userId: string;
  currentUrl: string | null;
  onUploaded?: (url: string | null) => void;
  /** Set to false to skip the captcha gate (e.g. admin editing another user's profile). Defaults to true. */
  requireCaptcha?: boolean;
}

const MAX_BYTES = 2 * 1024 * 1024;

export function AvatarUploader({
  userId,
  currentUrl,
  onUploaded,
  requireCaptcha = true,
}: AvatarUploaderProps) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const captcha = useCaptchaGate(userId);

  const captchaOk = !requireCaptcha || captcha.valid;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!captchaOk) { toast.error("Complete the captcha before updating the profile photo"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Pick an image file (PNG, JPG, WEBP, GIF)"); return; }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const uploadBlob = async (blob: Blob) => {
    setBusy(true);
    try {
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true,
        contentType: "image/jpeg",
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data.publicUrl;
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl } as never)
        .eq("id", userId);
      if (dbErr) throw dbErr;
      toast.success("Profile photo updated");
      onUploaded?.(publicUrl);
      qc.invalidateQueries({ queryKey: ["profile-lite", userId] });
      qc.invalidateQueries({ queryKey: ["users-roles"] });
      qc.invalidateQueries({ queryKey: ["team-members"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!captchaOk) {
      toast.error("Complete the captcha before removing the profile photo");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null } as never)
        .eq("id", userId);
      if (error) throw error;
      toast.success("Profile photo removed");
      onUploaded?.(null);
      qc.invalidateQueries({ queryKey: ["profile-lite", userId] });
      qc.invalidateQueries({ queryKey: ["users-roles"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {cropSrc && (
        <AvatarCropDialog
          open={!!cropSrc}
          onOpenChange={(o) => { if (!o) setCropSrc(null); }}
          imageSrc={cropSrc}
          onSave={uploadBlob}
        />
      )}
      <UserAvatar
        userId={userId}
        profile={{ id: userId, full_name: null, email: null, avatar_url: currentUrl }}
        size="xl"
      />
      <div className="flex flex-col gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onFileChange}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={busy || !captchaOk}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">{currentUrl ? "Replace" : "Upload"}</span>
          </Button>
          {currentUrl && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={remove}
              disabled={busy || !captchaOk}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {requireCaptcha && (
          <CaptchaBlock
            captchaKey={captcha.nonce}
            onValidChange={captcha.setValid}
            label="Required before changing this profile photo."
          />
        )}
        <p className="text-[10px] text-muted-foreground">PNG, JPG, WEBP · up to 10 MB</p>
      </div>
    </div>
  );
}
