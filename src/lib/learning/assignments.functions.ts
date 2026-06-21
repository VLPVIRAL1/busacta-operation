import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateTaskSchema = z.object({
  courseTitle: z.string().min(1),
  pathTitle: z.string().optional(),
  assigneeId: z.string().uuid(),
  dueDate: z.string().nullable().optional(),
});

const CompleteSchema = z.object({ assignmentId: z.string().uuid() });

export const createTrainingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateTaskSchema.parse(input))
  .handler(async ({ data, context }) => {
    const title = data.pathTitle
      ? `Complete Training Path: ${data.pathTitle}`
      : `Complete Training: ${data.courseTitle}`;
    const { error } = await context.supabase.from("tasks").insert({
      title,
      assignee_id: data.assigneeId,
      due_date: data.dueDate ?? null,
      created_by: context.userId,
      stream: "direct",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAssignmentComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("training_assignments")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", data.assignmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
