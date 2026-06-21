import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Geometry = z.union([
  z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  }),
]);

export type FileAnnotationReply = {
  id: string;
  annotation_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author_name?: string | null;
};

export type FileAnnotation = {
  id: string;
  file_id: string;
  task_id: string;
  page: number;
  kind: "pin" | "rect";
  geometry: { x: number; y: number; w?: number; h?: number };
  color: string;
  body: string;
  author_id: string | null;
  author_name?: string | null;
  is_client_visible: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  replies: FileAnnotationReply[];
};

export const listFileAnnotations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fileId: string }) => z.object({ fileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: anns, error } = await supabase
      .from("task_file_annotations")
      .select("*")
      .eq("file_id", data.fileId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const annotations = (anns ?? []) as FileAnnotation[];
    if (annotations.length === 0) return [];

    const ids = annotations.map((a) => a.id);
    const { data: reps } = await supabase
      .from("task_file_annotation_replies")
      .select("*")
      .in("annotation_id", ids)
      .order("created_at", { ascending: true });

    const authorIds = Array.from(
      new Set(
        [...annotations.map((a) => a.author_id), ...(reps ?? []).map((r) => r.author_id)].filter(
          Boolean,
        ) as string[],
      ),
    );
    const nameById = new Map<string, string>();
    if (authorIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", authorIds);
      for (const p of profs ?? []) nameById.set(p.id, p.full_name ?? p.email ?? "User");
    }

    const repliesByAnn = new Map<string, FileAnnotationReply[]>();
    for (const r of (reps ?? []) as FileAnnotationReply[]) {
      r.author_name = r.author_id ? (nameById.get(r.author_id) ?? null) : null;
      const arr = repliesByAnn.get(r.annotation_id) ?? [];
      arr.push(r);
      repliesByAnn.set(r.annotation_id, arr);
    }
    for (const a of annotations) {
      a.author_name = a.author_id ? (nameById.get(a.author_id) ?? null) : null;
      a.replies = repliesByAnn.get(a.id) ?? [];
    }
    return annotations;
  });

export const createFileAnnotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      fileId: string;
      taskId: string;
      page: number;
      kind: "pin" | "rect";
      geometry: z.infer<typeof Geometry>;
      body?: string;
      color?: string;
      isClientVisible?: boolean;
    }) =>
      z
        .object({
          fileId: z.string().uuid(),
          taskId: z.string().uuid(),
          page: z.number().int().min(1).max(10000),
          kind: z.enum(["pin", "rect"]),
          geometry: Geometry,
          body: z.string().max(2000).optional(),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          isClientVisible: z.boolean().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("task_file_annotations")
      .insert({
        file_id: data.fileId,
        task_id: data.taskId,
        page: data.page,
        kind: data.kind,
        geometry: data.geometry,
        body: data.body ?? "",
        color: data.color ?? "#fbbf24",
        is_client_visible: data.isClientVisible ?? false,
        author_id: userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateFileAnnotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      body?: string;
      color?: string;
      geometry?: z.infer<typeof Geometry>;
      isClientVisible?: boolean;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          body: z.string().max(2000).optional(),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          geometry: Geometry.optional(),
          isClientVisible: z.boolean().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: {
      body?: string;
      color?: string;
      geometry?: z.infer<typeof Geometry>;
      is_client_visible?: boolean;
    } = {};
    if (data.body !== undefined) patch.body = data.body;
    if (data.color !== undefined) patch.color = data.color;
    if (data.geometry !== undefined) patch.geometry = data.geometry;
    if (data.isClientVisible !== undefined) patch.is_client_visible = data.isClientVisible;
    const { error } = await supabase.from("task_file_annotations").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const resolveFileAnnotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; resolved: boolean }) =>
    z.object({ id: z.string().uuid(), resolved: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("task_file_annotations")
      .update({
        resolved_at: data.resolved ? new Date().toISOString() : null,
        resolved_by: data.resolved ? userId : null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteFileAnnotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("task_file_annotations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const replyToFileAnnotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { annotationId: string; body: string }) =>
    z.object({ annotationId: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("task_file_annotation_replies")
      .insert({
        annotation_id: data.annotationId,
        author_id: userId,
        body: data.body,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteFileAnnotationReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("task_file_annotation_replies")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
