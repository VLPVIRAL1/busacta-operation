import { supabase } from "@/integrations/supabase/client";

// TODO: replace with your real external worker endpoint.
export const BACKUP_WEBHOOK_URL = "https://my-external-worker.com/trigger-backup";

export const BACKUPS_BUCKET = "database-backups";

export type BackupFile = {
  name: string;
  size: number;
  createdAt: string | null;
};

export async function listBackups(): Promise<BackupFile[]> {
  const { data, error } = await supabase.storage.from(BACKUPS_BUCKET).list("", {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw error;
  return (data ?? [])
    .filter((f) => f.name && /\.sql(\.gz)?$/i.test(f.name))
    .map((f) => ({
      name: f.name,
      size: (f.metadata as { size?: number } | null)?.size ?? 0,
      createdAt: f.created_at ?? f.updated_at ?? null,
    }));
}

export async function getSignedDownloadUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BACKUPS_BUCKET)
    .createSignedUrl(path, 60, { download: true });
  if (error) throw error;
  return data.signedUrl;
}

export async function triggerBackup(token: string, userId: string): Promise<void> {
  const res = await fetch(BACKUP_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-user-id": userId,
    },
    body: JSON.stringify({ requestedAt: new Date().toISOString(), userId }),
  });
  if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
}
