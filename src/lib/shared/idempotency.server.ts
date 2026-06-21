import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Wrap a sensitive server action so that retries with the same idempotency key
 * (e.g. from a flaky network or double-click) replay the original response
 * instead of executing the work twice.
 *
 * The first call records the key + a hash of the request payload. Subsequent
 * calls with the same key:
 *  - Return the cached response if completed.
 *  - Throw if the request payload differs (key reuse with different inputs).
 *  - Throw "in_progress" if a concurrent caller is mid-flight.
 *
 * Keys auto-expire after 24 hours (column default + scheduled cleanup).
 */
export async function withIdempotency<T>(args: {
  key: string;
  actorId: string;
  scope: string;
  request: unknown;
  run: () => Promise<T>;
}): Promise<T> {
  const { key, actorId, scope, request, run } = args;
  if (!key || key.length < 8 || key.length > 200) {
    throw new Error("invalid idempotency key");
  }
  const requestHash = createHash("sha256")
    .update(JSON.stringify(request ?? null))
    .digest("hex");

  // Fast path: existing record for this key.
  const { data: existing } = await supabaseAdmin
    .from("idempotency_keys")
    .select("status, response, request_hash, scope, actor_id")
    .eq("key", key)
    .maybeSingle();

  if (existing) {
    if (existing.actor_id !== actorId || existing.scope !== scope) {
      throw new Error("idempotency key collision (different actor or scope)");
    }
    if (existing.request_hash && existing.request_hash !== requestHash) {
      throw new Error("idempotency key reused with a different request payload");
    }
    if (existing.status === "in_progress") {
      throw new Error("idempotent request already in progress");
    }
    if (existing.status === "completed") {
      return existing.response as T;
    }
    // failed → fall through and retry
  }

  // Reserve the key.
  const { error: insErr } = await supabaseAdmin.from("idempotency_keys").upsert(
    {
      key,
      actor_id: actorId,
      scope,
      request_hash: requestHash,
      status: "in_progress",
      response: null,
    },
    { onConflict: "key" },
  );
  if (insErr) throw insErr;

  try {
    const result = await run();
    await supabaseAdmin
      .from("idempotency_keys")
      .update({ status: "completed", response: (result ?? null) as never })
      .eq("key", key);
    return result;
  } catch (err) {
    await supabaseAdmin.from("idempotency_keys").update({ status: "failed" }).eq("key", key);
    throw err;
  }
}
