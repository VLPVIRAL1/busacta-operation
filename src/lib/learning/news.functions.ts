import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateNewsSchema = z.object({
  firmId: z.string().uuid(),
  title: z.string().min(1).max(256),
  content: z.string().optional(),
  pinned: z.boolean().default(false),
  publish: z.boolean().default(true),
});

const UpdateNewsSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(256).optional(),
  content: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  publish: z.boolean().optional(),
});

const IdSchema = z.object({ id: z.string().uuid() });
const TogglePinSchema = z.object({ id: z.string().uuid(), pinned: z.boolean() });

export const createNewsPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateNewsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("learning_news_posts" as never).insert({
      firm_id: data.firmId,
      title: data.title,
      content: data.content ?? null,
      author_id: context.userId,
      pinned: data.pinned,
      published_at: data.publish ? new Date().toISOString() : null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateNewsPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateNewsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.content !== undefined) patch.content = data.content;
    if (data.pinned !== undefined) patch.pinned = data.pinned;
    if (data.publish === true) patch.published_at = new Date().toISOString();
    if (data.publish === false) patch.published_at = null;
    const { error } = await context.supabase
      .from("learning_news_posts" as never)
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNewsPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("learning_news_posts" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const togglePinNewsPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TogglePinSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("learning_news_posts" as never)
      .update({ pinned: data.pinned } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
