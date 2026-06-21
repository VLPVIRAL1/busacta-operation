import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateQuestionSchema = z.object({
  firmId: z.string().uuid(),
  courseId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(512),
  body: z.string().optional(),
});

const CreateAnswerSchema = z.object({
  questionId: z.string().uuid(),
  body: z.string().min(1),
});

const AcceptAnswerSchema = z.object({
  answerId: z.string().uuid(),
  questionId: z.string().uuid(),
});

const IdSchema = z.object({ id: z.string().uuid() });

export const createQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateQuestionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("learning_questions" as never)
      .insert({
        firm_id: data.firmId,
        course_id: data.courseId ?? null,
        asker_id: context.userId,
        title: data.title,
        body: data.body ?? null,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const createAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateAnswerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("learning_answers" as never)
      .insert({
        question_id: data.questionId,
        author_id: context.userId,
        body: data.body,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const markAnswerAccepted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AcceptAnswerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error: aErr } = await context.supabase
      .from("learning_answers" as never)
      .update({ is_accepted: true } as never)
      .eq("id", data.answerId);
    if (aErr) throw new Error(aErr.message);
    const { error: qErr } = await context.supabase
      .from("learning_questions" as never)
      .update({ is_resolved: true } as never)
      .eq("id", data.questionId);
    if (qErr) throw new Error(qErr.message);
    return { ok: true };
  });

export const deleteQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("learning_questions" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
