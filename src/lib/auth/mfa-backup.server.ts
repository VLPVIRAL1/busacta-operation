// Server-only MFA backup code helpers.
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CODE_COUNT = 10;

function makeCode(): string {
  // 10-char base32-ish code, easy to read: XXXX-XXXX
  const raw = randomBytes(6)
    .toString("base64")
    .replace(/[^A-Z0-9]/gi, "")
    .slice(0, 8)
    .toUpperCase()
    .padEnd(8, "X");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export async function generateBackupCodesServer(userId: string) {
  // Wipe any existing codes for the user, then issue fresh ones.
  const del = await supabaseAdmin.from("mfa_backup_codes").delete().eq("user_id", userId);
  if (del.error) throw del.error;

  const codes = Array.from({ length: CODE_COUNT }, () => makeCode());
  const rows = codes.map((c) => ({ user_id: userId, code_hash: hashCode(c) }));
  const ins = await supabaseAdmin.from("mfa_backup_codes").insert(rows as never);
  if (ins.error) throw ins.error;
  return { codes };
}

export async function consumeBackupCodeServer(userId: string, code: string) {
  const norm = (code || "").trim().toUpperCase();
  if (!norm) return { ok: false as const, error: "Code required" };
  const target = hashCode(norm);

  const { data, error } = await supabaseAdmin
    .from("mfa_backup_codes")
    .select("id, code_hash, used_at")
    .eq("user_id", userId)
    .is("used_at", null);
  if (error) throw error;

  // Constant-time compare against each candidate to avoid timing leaks.
  const targetBuf = Buffer.from(target, "hex");
  const match = (data ?? []).find((r: { code_hash: string }) => {
    const b = Buffer.from(r.code_hash, "hex");
    return b.length === targetBuf.length && timingSafeEqual(b, targetBuf);
  });
  if (!match) return { ok: false as const, error: "Invalid or already used code" };

  const upd = await supabaseAdmin
    .from("mfa_backup_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", match.id);
  if (upd.error) throw upd.error;
  const remaining = (data ?? []).length - 1;
  return { ok: true as const, remaining };
}

export async function getBackupCodeStatusServer(userId: string) {
  const { count, error } = await supabaseAdmin
    .from("mfa_backup_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("used_at", null);
  if (error) throw error;
  return { remaining: count ?? 0 };
}
