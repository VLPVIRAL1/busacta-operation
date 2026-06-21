import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UpsertNoteSchema = z.object({
  courseId: z.string().uuid().nullable().optional(),
  sharepointItemId: z.string().max(512).nullable().optional(),
  content: z.unknown(),
});

export const upsertTrainingNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertNoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("training_notes" as never).upsert(
      {
        employee_id: context.userId,
        course_id: data.courseId ?? null,
        sharepoint_item_id: data.sharepointItemId ?? null,
        content: data.content,
        updated_at: new Date().toISOString(),
      } as never,
      {
        onConflict: data.courseId ? "employee_id,course_id" : "employee_id,sharepoint_item_id",
      },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
