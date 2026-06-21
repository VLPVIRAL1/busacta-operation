// Server functions for productivity tracking — sessions and screenshot signed URLs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const startProductivitySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().uuid().nullable(),
        taskId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const startedAt = new Date(Date.now()).toISOString();
    const { data: row, error } = await supabase
      .from("productivity_sessions")
      .insert({
        user_id: userId,
        project_id: data.projectId,
        task_id: data.taskId,
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { sessionId: (row as any).id as string };
  });

export const endProductivitySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sessionId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const endedAt = new Date(Date.now()).toISOString();
    const { error } = await supabase
      .from("productivity_sessions")
      .update({ ended_at: endedAt })
      .eq("id", data.sessionId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getScreenshotSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        logId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: row, error } = await supabase
      .from("activity_logs")
      .select("screenshot_path")
      .eq("id", data.logId)
      .single();
    if (error || !row || !(row as any).screenshot_path) {
      return { url: null };
    }
    const screenshotPath: string = (row as any).screenshot_path;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("productivity-screenshots")
      .createSignedUrl(screenshotPath, 60);
    if (signError || !signed) {
      return { url: null };
    }
    return { url: signed.signedUrl as string };
  });
