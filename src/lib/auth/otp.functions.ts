// Server functions for OTP backup channels (sign-in second factor).
// Thin wrappers around helpers in ./otp.server so the import-protection
// boundary stays clean.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type Channel,
  checkRateLimit,
  createChallenge,
  maskDestination,
  sendEmailCode,
  sendSmsCode,
  sendWhatsAppCode,
  verifyChallenge,
} from "./otp.server";

const ChannelSchema = z.enum(["email", "sms", "whatsapp"]);
const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, "Phone must be in E.164 format, e.g. +14155551234");

// List the channels the current user has enrolled.
export const listOtpChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as { supabase: any; userId: string; claims: any };
    const { data, error } = await supabase
      .from("user_otp_channels")
      .select("channel, destination, verified_at")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const accountEmail = (claims?.email as string | undefined) ?? null;
    return {
      accountEmail,
      channels: (data ?? []).map(
        (row: { channel: string; destination: string; verified_at: string | null }) => ({
          channel: row.channel as Channel,
          destination: row.destination,
          masked: maskDestination(row.channel as Channel, row.destination),
          verified: !!row.verified_at,
        }),
      ),
    };
  });

// Begin enrollment of a new channel: stores the destination unverified and
// dispatches a one-time code to it.
export const startOtpEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        channel: ChannelSchema,
        destination: z.string().trim().min(3),
      })
      .superRefine((v, ctx) => {
        if (v.channel === "sms" || v.channel === "whatsapp") {
          const r = PhoneSchema.safeParse(v.destination);
          if (!r.success) ctx.addIssue({ code: "custom", message: r.error.issues[0].message });
        } else {
          const r = z.string().email().safeParse(v.destination);
          if (!r.success) ctx.addIssue({ code: "custom", message: "Enter a valid email address" });
        }
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const dest = data.channel === "email" ? data.destination.toLowerCase() : data.destination;

    const rate = await checkRateLimit(supabase, userId, data.channel);
    if (!rate.ok) return { ok: false as const, error: rate.error };

    // Upsert the channel as unverified.
    const { error: upErr } = await supabase
      .from("user_otp_channels")
      .upsert(
        { user_id: userId, channel: data.channel, destination: dest, verified_at: null },
        { onConflict: "user_id,channel" },
      );
    if (upErr) return { ok: false as const, error: upErr.message };

    const ch = await createChallenge(supabase, userId, data.channel, dest, "enrollment");
    if (!ch.ok) return ch;

    try {
      if (data.channel === "email") await sendEmailCode(dest, ch.code);
      else if (data.channel === "whatsapp") await sendWhatsAppCode(dest, ch.code);
      else await sendSmsCode(dest, ch.code);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to send code";
      return { ok: false as const, error: message };
    }

    return { ok: true as const, challengeId: ch.id, masked: maskDestination(data.channel, dest) };
  });

// Confirm the enrollment code → marks the channel verified.
export const verifyOtpEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        challengeId: z.string().uuid(),
        code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const result = await verifyChallenge(supabase, userId, data.challengeId, data.code);
    if (!result.ok) return result;
    if (result.purpose !== "enrollment") return { ok: false as const, error: "Wrong code purpose" };

    const { error } = await supabase
      .from("user_otp_channels")
      .update({ verified_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("channel", result.channel);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// Remove an enrolled channel.
export const removeOtpChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ channel: ChannelSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { error } = await supabase
      .from("user_otp_channels")
      .delete()
      .eq("user_id", userId)
      .eq("channel", data.channel);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// Issue a fresh login challenge to one of the user's verified channels.
export const sendLoginOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ channel: ChannelSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: row, error } = await supabase
      .from("user_otp_channels")
      .select("destination, verified_at")
      .eq("user_id", userId)
      .eq("channel", data.channel)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    if (!row || !row.verified_at) {
      return {
        ok: false as const,
        error: "This channel isn't enrolled. Add it first under Security → MFA.",
      };
    }

    const rate = await checkRateLimit(supabase, userId, data.channel);
    if (!rate.ok) return { ok: false as const, error: rate.error };

    const ch = await createChallenge(supabase, userId, data.channel, row.destination, "login");
    if (!ch.ok) return ch;

    try {
      if (data.channel === "email") await sendEmailCode(row.destination, ch.code);
      else if (data.channel === "whatsapp") await sendWhatsAppCode(row.destination, ch.code);
      else await sendSmsCode(row.destination, ch.code);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to send code";
      return { ok: false as const, error: message };
    }

    return {
      ok: true as const,
      challengeId: ch.id,
      masked: maskDestination(data.channel, row.destination),
    };
  });

// Verify a login challenge code. Returns ok=true on success — the caller
// proceeds with the existing session (TOTP factor unaffected, same model as
// recovery-code bypass).
export const verifyLoginOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        challengeId: z.string().uuid(),
        code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const result = await verifyChallenge(supabase, userId, data.challengeId, data.code);
    if (!result.ok) return result;
    if (result.purpose !== "login") return { ok: false as const, error: "Wrong code purpose" };
    return { ok: true as const };
  });
