/**
 * Integration tests for create_chat_thread RPC.
 *
 * Prevents RLS regressions: chat_threads INSERT requires
 * created_by = auth.uid() + internal user, and chat_thread_members INSERT
 * requires an owner row to already exist. The RPC must wrap both in one
 * SECURITY DEFINER step so the client never has to fight that ordering.
 *
 * Skipped unless SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL are set.
 * Run: bunx vitest run tests/integration/create-chat-thread.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !url || !serviceKey || !anonKey;

const d = skip ? describe.skip : describe;

d("create_chat_thread RPC", () => {
  const admin = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const marker = `chat-rpc-${Date.now()}`;
  const password = "Test-Passw0rd!" + marker;
  let u1 = "",
    u2 = "",
    u3 = "",
    uClient = "";
  let asU1: SupabaseClient, asU2: SupabaseClient, asU3: SupabaseClient, asClient: SupabaseClient;
  const createdThreads: string[] = [];

  const signIn = async (email: string) => {
    const c = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return c;
  };

  beforeAll(async () => {
    const mk = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      return data.user!.id;
    };
    [u1, u2, u3, uClient] = await Promise.all([
      mk(`${marker}-u1@ex.dev`),
      mk(`${marker}-u2@ex.dev`),
      mk(`${marker}-u3@ex.dev`),
      mk(`${marker}-client@ex.dev`),
    ]);
    await admin.from("user_roles").insert([
      { user_id: u1, role: "employee" },
      { user_id: u2, role: "employee" },
      { user_id: u3, role: "employee" },
      { user_id: uClient, role: "client" },
    ]);
    [asU1, asU2, asU3, asClient] = await Promise.all([
      signIn(`${marker}-u1@ex.dev`),
      signIn(`${marker}-u2@ex.dev`),
      signIn(`${marker}-u3@ex.dev`),
      signIn(`${marker}-client@ex.dev`),
    ]);
  });

  afterAll(async () => {
    if (createdThreads.length) {
      await admin.from("chat_thread_members").delete().in("thread_id", createdThreads);
      await admin.from("chat_threads").delete().in("id", createdThreads);
    }
    for (const id of [u1, u2, u3, uClient]) {
      if (id) await admin.auth.admin.deleteUser(id).catch(() => {});
    }
  });

  it("creates a DM thread with both participants as members (owner = creator)", async () => {
    const { data, error } = await asU1.rpc("create_chat_thread", {
      _kind: "dm",
      _member_ids: [u2],
    });
    expect(error).toBeNull();
    expect(typeof data).toBe("string");
    const threadId = data as string;
    createdThreads.push(threadId);

    const { data: t } = await admin
      .from("chat_threads")
      .select("kind,dm_key,created_by")
      .eq("id", threadId)
      .single();
    expect(t?.kind).toBe("dm");
    expect(t?.created_by).toBe(u1);
    expect(t?.dm_key).toContain(":");

    const { data: m } = await admin
      .from("chat_thread_members")
      .select("user_id,role")
      .eq("thread_id", threadId);
    const byUser = Object.fromEntries((m ?? []).map((r) => [r.user_id, r.role]));
    expect(byUser[u1]).toBe("owner");
    expect(byUser[u2]).toBe("member");
  });

  it("returns the existing DM thread when called twice (idempotent)", async () => {
    const a = await asU1.rpc("create_chat_thread", { _kind: "dm", _member_ids: [u3] });
    const b = await asU3.rpc("create_chat_thread", { _kind: "dm", _member_ids: [u1] });
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data).toBe(b.data);
    createdThreads.push(a.data as string);
  });

  it("creates a Group thread with all selected members and creator as owner", async () => {
    const { data, error } = await asU1.rpc("create_chat_thread", {
      _kind: "group",
      _member_ids: [u2, u3],
      _name: `${marker} group`,
    });
    expect(error).toBeNull();
    const threadId = data as string;
    createdThreads.push(threadId);

    const { data: m } = await admin
      .from("chat_thread_members")
      .select("user_id,role")
      .eq("thread_id", threadId);
    const byUser = Object.fromEntries((m ?? []).map((r) => [r.user_id, r.role]));
    expect(byUser[u1]).toBe("owner");
    expect(byUser[u2]).toBe("member");
    expect(byUser[u3]).toBe("member");
  });

  it("allows a non-owner employee to create their own group (they become owner)", async () => {
    const { data, error } = await asU2.rpc("create_chat_thread", {
      _kind: "group",
      _member_ids: [u1, u3],
      _name: `${marker} u2-group`,
    });
    expect(error).toBeNull();
    const threadId = data as string;
    createdThreads.push(threadId);

    const { data: m } = await admin
      .from("chat_thread_members")
      .select("user_id,role")
      .eq("thread_id", threadId);
    const byUser = Object.fromEntries((m ?? []).map((r) => [r.user_id, r.role]));
    expect(byUser[u2]).toBe("owner");
    expect(byUser[u1]).toBe("member");
    expect(byUser[u3]).toBe("member");
  });

  it("rejects unnamed groups", async () => {
    const { error } = await asU1.rpc("create_chat_thread", {
      _kind: "group",
      _member_ids: [u2],
    });
    expect(error).not.toBeNull();
  });

  it("rejects DM with zero or multiple counterparts", async () => {
    const empty = await asU1.rpc("create_chat_thread", { _kind: "dm", _member_ids: [u1] });
    expect(empty.error).not.toBeNull();
    const many = await asU1.rpc("create_chat_thread", { _kind: "dm", _member_ids: [u2, u3] });
    expect(many.error).not.toBeNull();
  });

  it("rejects non-internal (client) users", async () => {
    const { error } = await asClient.rpc("create_chat_thread", {
      _kind: "dm",
      _member_ids: [u1],
    });
    expect(error).not.toBeNull();
  });
});
