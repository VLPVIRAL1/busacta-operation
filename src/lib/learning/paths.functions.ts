import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreatePathSchema = z.object({
  firmId: z.string().uuid(),
  title: z.string().min(1).max(256),
  description: z.string().optional(),
});

const UpdatePathSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(256).optional(),
  description: z.string().nullable().optional(),
});

const IdSchema = z.object({ id: z.string().uuid() });

const AddItemSchema = z.object({
  pathId: z.string().uuid(),
  courseId: z.string().uuid(),
  position: z.number().int().min(0).default(0),
});

const ReorderSchema = z.object({
  pathId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()),
});

const AssignSchema = z.object({
  pathId: z.string().uuid(),
  employeeIds: z.array(z.string().uuid()).min(1),
  dueDate: z.string().nullable().optional(),
});

export const createPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreatePathSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("training_paths" as never)
      .insert({
        firm_id: data.firmId,
        title: data.title,
        description: data.description ?? null,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const updatePath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdatePathSchema.parse(input))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    const { error } = await context.supabase
      .from("training_paths" as never)
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("training_paths" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addPathItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddItemSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("training_path_items" as never)
      .insert({ path_id: data.pathId, course_id: data.courseId, position: data.position } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const removePathItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("training_path_items" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderPathItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReorderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const updates = data.orderedIds.map((id, position) =>
      context.supabase
        .from("training_path_items" as never)
        .update({ position } as never)
        .eq("id", id),
    );
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error);
    if (err?.error) throw new Error(err.error.message);
    return { ok: true };
  });

export const assignPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AssignSchema.parse(input))
  .handler(async ({ data, context }) => {
    const rows = data.employeeIds.map((employeeId) => ({
      path_id: data.pathId,
      employee_id: employeeId,
      assigned_by: context.userId,
      due_date: data.dueDate ?? null,
    }));
    const { error } = await context.supabase
      .from("training_path_assignments" as never)
      .upsert(rows as never, { onConflict: "path_id,employee_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unassignPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("training_path_assignments" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
