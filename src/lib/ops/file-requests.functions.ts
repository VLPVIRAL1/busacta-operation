// Server functions for shareable "Request File" upload links.
// Round 3: links can be protected with a system-generated password (admins
// can rotate via setFileRequestPassword). Password is shown to the creator
// exactly once on create / rotate — only the hash is stored.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateFileRequestPassword,
  hashFileRequestPassword,
  verifyFileRequestPassword,
} from "@/lib/ops/file-request-password";

const TaskIdSchema = z.string().uuid();
const TokenSchema = z
  .string()
  .min(20)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

function generateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 36);
}

export type FileRequestLinkRow = {
  id: string;
  task_id: string;
  token: string;
  message: string | null;
  expires_at: string;
  max_uploads: number;
  upload_count: number;
  revoked_at: string | null;
  created_at: string;
  has_password: boolean;
};

export const createFileRequestLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        taskId: TaskIdSchema,
        message: z.string().trim().max(500).optional(),
        expiresInHours: z
          .number()
          .int()
          .min(1)
          .max(24 * 30)
          .default(168),
        maxUploads: z.number().int().min(1).max(100).default(25),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const token = generateToken();
    const password = generateFileRequestPassword();
    const password_hash = await hashFileRequestPassword(password);
    const expiresAt = new Date(Date.now() + data.expiresInHours * 3600 * 1000).toISOString();
    const { data: row, error } = await supabase
      .from("file_request_links")
      .insert({
        task_id: data.taskId,
        token,
        created_by: userId,
        message: data.message ?? null,
        expires_at: expiresAt,
        max_uploads: data.maxUploads,
        password_hash,
        password_set_at: new Date().toISOString(),
      })
      .select(
        "id, task_id, token, message, expires_at, max_uploads, upload_count, revoked_at, created_at, password_hash",
      )
      .single();
    if (error) throw new Error(error.message);
    const { password_hash: _, ...safe } = row as any;
    return { ...safe, has_password: true, password } as FileRequestLinkRow & { password: string };
  });

export const listFileRequestLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: TaskIdSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: rows, error } = await supabase
      .from("file_request_links")
      .select(
        "id, task_id, token, message, expires_at, max_uploads, upload_count, revoked_at, created_at, password_hash",
      )
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map((r) => {
      const { password_hash, ...safe } = r;
      return { ...safe, has_password: !!password_hash };
    }) as FileRequestLinkRow[];
  });

export const revokeFileRequestLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("file_request_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin rotates the link password — returns the new plaintext exactly once. */
export const rotateFileRequestPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const password = generateFileRequestPassword();
    const password_hash = await hashFileRequestPassword(password);
    const { error } = await supabase
      .from("file_request_links")
      .update({ password_hash, password_set_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, password };
  });

/** Public — resolves token to a safe payload (and signals whether a password is required). */
export const resolveFileRequestLink = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: TokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("file_request_links")
      .select(
        "id, task_id, message, expires_at, max_uploads, upload_count, revoked_at, password_hash, tasks:task_id(title)",
      )
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { valid: false as const, reason: "not_found" as const };
    if (row.revoked_at) return { valid: false as const, reason: "revoked" as const };
    if (new Date(row.expires_at).getTime() < Date.now())
      return { valid: false as const, reason: "expired" as const };
    if ((row.upload_count ?? 0) >= row.max_uploads)
      return { valid: false as const, reason: "limit_reached" as const };
    return {
      valid: true as const,
      taskTitle: (row.tasks as { title: string } | null)?.title ?? "this task",
      message: row.message ?? null,
      remaining: row.max_uploads - (row.upload_count ?? 0),
      expiresAt: row.expires_at,
      requiresPassword: !!row.password_hash,
    };
  });

/** Public — verifies a password against a token without exposing the hash. */
export const checkFileRequestPassword = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: TokenSchema,
        password: z.string().min(1).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("file_request_links")
      .select("password_hash, revoked_at, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false as const };
    }
    const ok = await verifyFileRequestPassword(data.password, row.password_hash);
    return { ok: ok as boolean };
  });
