import { useState, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CloudUpload, Loader2, CheckCircle2, AlertTriangle, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  resolveFileRequestLink,
  checkFileRequestPassword,
} from "@/lib/ops/file-requests.functions";
import { formatBytes } from "@/lib/format/format-bytes";

export const Route = createFileRoute("/portal/upload/$token")({
  component: PublicUploadPage,
});

type UploadedItem = { name: string; size: number; status: "ok" | "error"; error?: string };

function PublicUploadPage() {
  const { token } = Route.useParams();
  const resolve = useServerFn(resolveFileRequestLink);
  const verify = useServerFn(checkFileRequestPassword);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockedPassword, setUnlockedPassword] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const { data: info, isLoading } = useQuery({
    queryKey: ["file-request-resolve", token],
    queryFn: () => resolve({ data: { token } }),
    retry: false,
  });

  const needsPassword = info?.valid && info.requiresPassword && !unlockedPassword;

  async function tryUnlock() {
    if (!password.trim()) return;
    setUnlocking(true);
    try {
      const r = await verify({ data: { token, password: password.trim() } });
      if (r.ok) {
        setUnlockedPassword(password.trim());
        toast.success("Unlocked");
      } else {
        toast.error("Incorrect password");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUnlocking(false);
    }
  }

  async function uploadAll(files: FileList | File[]) {
    if (uploading) return;
    setUploading(true);
    const arr = Array.from(files);
    const results: UploadedItem[] = [];
    for (const file of arr) {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("file", file);
      if (unlockedPassword) fd.append("password", unlockedPassword);
      try {
        const res = await fetch("/api/public/file-request/upload", { method: "POST", body: fd });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          results.push({
            name: file.name,
            size: file.size,
            status: "error",
            error: json.error ?? `HTTP ${res.status}`,
          });
          toast.error(`${file.name}: ${json.error ?? "Upload failed"}`);
        } else {
          results.push({ name: file.name, size: file.size, status: "ok" });
        }
      } catch (e) {
        results.push({
          name: file.name,
          size: file.size,
          status: "error",
          error: (e as Error).message,
        });
      }
    }
    setUploaded((prev) => [...results, ...prev]);
    setUploading(false);
    if (results.some((r) => r.status === "ok")) {
      toast.success(`Uploaded ${results.filter((r) => r.status === "ok").length} file(s)`);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <CloudUpload className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Upload documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Securely share files with your accountant. No account required.
          </p>
        </header>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !info?.valid ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="h-5 w-5" />
                This upload link is not available
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {info?.reason === "expired" && "The link has expired. Please request a new one."}
              {info?.reason === "revoked" && "The link has been revoked by the sender."}
              {info?.reason === "limit_reached" &&
                "The maximum number of uploads for this link has been reached."}
              {(!info || info?.reason === "not_found") &&
                "We couldn't find this link. Please check the URL."}
            </CardContent>
          </Card>
        ) : needsPassword ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4" /> Password required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Enter the password provided by the sender to access this upload link.
              </p>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void tryUnlock();
                }}
                placeholder="Password"
                autoFocus
              />
              <Button
                onClick={() => void tryUnlock()}
                disabled={unlocking || !password.trim()}
                className="w-full"
              >
                {unlocking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Unlock
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">For: {info.taskTitle}</CardTitle>
              {info.message && <p className="text-sm text-muted-foreground">{info.message}</p>}
              <p className="text-xs text-muted-foreground">
                {info.remaining} upload{info.remaining === 1 ? "" : "s"} remaining · expires{" "}
                {new Date(info.expiresAt).toLocaleString()}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files?.length) void uploadAll(e.dataTransfer.files);
                }}
                className={`grid place-items-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <CloudUpload className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Drag files here, or</p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CloudUpload className="h-4 w-4" />
                  )}
                  Choose files
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  hidden
                  multiple
                  onChange={(e) => {
                    if (e.target.files?.length) void uploadAll(e.target.files);
                    e.target.value = "";
                  }}
                />
                <p className="mt-2 text-[11px] text-muted-foreground">Max 50 MB per file.</p>
              </div>

              {uploaded.length > 0 && (
                <ul className="space-y-1.5">
                  {uploaded.map((u, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                    >
                      {u.status === "ok" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{u.name}</span>
                      <span className="text-xs text-muted-foreground">{formatBytes(u.size)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
