/**
 * Server function for bulk-creating tasks with auto-creation of missing
 * clients and entities.
 *
 * Four-pass pipeline:
 *  1. Resolve / create firm-level clients
 *  2. Resolve / create project-scoped entities via ensure_entity_for_firm_client
 *  3. Batch-insert tasks in chunks of 50 (parallel, with per-row error capture)
 *  4. Write task_assignees join rows for resolved assignees/reviewers
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Schemas ────────────────────────────────────────────────────────

const BulkTaskRowSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required"),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().nullable().optional(),
  /** Pre-resolved by the client; null if unresolved / not provided. */
  assigneeId: z.string().uuid().nullable().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "in_progress", "review", "waiting_client", "complete"]).default("draft"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  complexity: z.enum(["a_hard", "b_medium", "c_easy"]).default("b_medium"),
  period: z
    .string()
    .nullable()
    .optional()
    .transform((v) => {
      if (!v) return null;
      const t = v.trim().toLowerCase();
      if (!t) return null;
      if (t.startsWith("month")) return "Monthly";
      if (t.startsWith("quart")) return "Quarterly";
      if (t.startsWith("year") || t === "annual" || t === "annually") return "Yearly";
      if (t.startsWith("ad") || t === "one-time" || t === "onetime") return "Ad-hoc";
      return null;
    }),
  taxYear: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  // Accept ISO date or datetime; postgres `date` will store the date portion.
  startDate: z
    .string()
    .nullable()
    .optional()
    .transform((v) => {
      if (!v) return null;
      const t = v.trim();
      if (!t) return null;
      // Keep YYYY-MM-DD; strip any time suffix.
      return t.length >= 10 ? t.slice(0, 10) : t;
    }),
  returnTypeId: z.string().uuid().nullable().optional(),
  displayId: z.string().trim().max(80).nullable().optional(),
});

export type BulkTaskRowInput = z.infer<typeof BulkTaskRowSchema>;

const BulkCreateInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("firm"),
    firmId: z.string().uuid(),
    projectId: z.string().uuid(),
    rows: z.array(BulkTaskRowSchema).min(1).max(500),
  }),
  z.object({
    mode: z.literal("direct_client"),
    directClientId: z.string().uuid(),
    taskTypeId: z.string().uuid(),
    rows: z.array(BulkTaskRowSchema).min(1).max(500),
  }),
]);

export type BulkCreateResult = {
  created: number;
  errors: { rowIndex: number; message: string }[];
};

// ─── Helpers ────────────────────────────────────────────────────────

const CHUNK_SIZE = 50;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── Server Function ─────────────────────────────────────────────────

export const bulkCreateTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BulkCreateInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<BulkCreateResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as unknown as { supabase: any; userId: string };
    const { rows } = data;

    const errors: { rowIndex: number; message: string }[] = [];

    // ── Direct-client mode: skip client/entity resolution ────────
    if (data.mode === "direct_client") {
      const { directClientId, taskTypeId } = data;

      type DirectTaskInsert = {
        direct_client_id: string;
        task_type_id: string;
        stream: string;
        title: string;
        description: string | null;
        status: string;
        priority: string;
        complexity: string;
        period: string | null;
        tax_year: number | null;
        due_date: string | null;
        start_date: string | null;
        display_id: string | null;
        assignee_id: string | null;
        reviewer_id: string | null;
        created_by: string;
      };

      const insertable: {
        rowIndex: number;
        task: DirectTaskInsert;
        assigneeId: string | null;
        reviewerId: string | null;
      }[] = rows.map((row, i) => ({
        rowIndex: i,
        assigneeId: row.assigneeId ?? null,
        reviewerId: row.reviewerId ?? null,
        task: {
          direct_client_id: directClientId,
          task_type_id: taskTypeId,
          stream: "direct",
          title: row.title,
          description: row.description ?? null,
          status: row.status,
          priority: row.priority,
          complexity: row.complexity,
          period: row.period ?? null,
          tax_year: row.taxYear ?? null,
          due_date: row.dueDate ?? null,
          start_date: row.startDate ?? null,
          display_id: row.displayId?.trim() || null,
          assignee_id: row.assigneeId ?? null,
          reviewer_id: row.reviewerId ?? null,
          created_by: userId,
        },
      }));

      const chunks = chunk(insertable, CHUNK_SIZE);
      const allAssigneeRows: { task_id: string; user_id: string; role: string }[] = [];
      let totalCreated = 0;

      for (const batch of chunks) {
        const { data: inserted, error: insErr } = await supabase
          .from("tasks")
          .insert(batch.map((b) => b.task))
          .select("id");
        if (insErr) {
          batch.forEach((b) => errors.push({ rowIndex: b.rowIndex, message: insErr.message }));
        } else {
          const ids = inserted as { id: string }[];
          totalCreated += ids.length;
          ids.forEach((record, i) => {
            const b = batch[i];
            if (b.assigneeId)
              allAssigneeRows.push({ task_id: record.id, user_id: b.assigneeId, role: "assignee" });
            if (b.reviewerId)
              allAssigneeRows.push({ task_id: record.id, user_id: b.reviewerId, role: "reviewer" });
          });
        }
      }

      if (allAssigneeRows.length > 0) {
        const { error: assignErr } = await supabase
          .from("task_assignees")
          .upsert(allAssigneeRows, { onConflict: "task_id,user_id,role" });
        if (assignErr) console.warn("[bulk-import] task_assignees upsert failed:", assignErr.message);
      }

      return { created: totalCreated, errors };
    }

    // ── Firm / CPA mode ───────────────────────────────────────────
    const { firmId, projectId } = data;

    // ── Pass 1: Resolve / create clients ─────────────────────────

    const { data: existingClients, error: clientsErr } = await supabase
      .from("clients")
      .select("id, name")
      .eq("firm_id", firmId);
    if (clientsErr) throw new Error(`Failed to load clients: ${clientsErr.message}`);

    const clientMap = new Map<string, string>(); // lowercase name → id
    for (const c of (existingClients ?? []) as { id: string; name: string }[]) {
      clientMap.set(c.name.trim().toLowerCase(), c.id);
    }

    // Collect unique new client names
    const uniqueNewNames = new Map<string, string>(); // lowercase → original casing
    for (const row of rows) {
      const key = row.clientName.trim().toLowerCase();
      if (!clientMap.has(key) && !uniqueNewNames.has(key)) {
        uniqueNewNames.set(key, row.clientName.trim());
      }
    }

    // Create missing clients one-by-one to capture per-name errors
    for (const [key, originalName] of uniqueNewNames) {
      const { data: newClient, error: insertErr } = await supabase
        .from("clients")
        .insert({ firm_id: firmId, name: originalName, kind: "client" })
        .select("id")
        .single();
      if (insertErr) {
        rows.forEach((r, i) => {
          if (r.clientName.trim().toLowerCase() === key) {
            errors.push({
              rowIndex: i,
              message: `Could not create client "${originalName}": ${insertErr.message}`,
            });
          }
        });
      } else {
        clientMap.set(key, (newClient as { id: string }).id);
      }
    }

    // ── Pass 2: Resolve / create entities ────────────────────────

    const uniqueClientIds = new Set<string>();
    for (const row of rows) {
      const cid = clientMap.get(row.clientName.trim().toLowerCase());
      if (cid) uniqueClientIds.add(cid);
    }

    const entityMap = new Map<string, string>(); // clientId → entityId
    for (const clientId of uniqueClientIds) {
      const { data: entityId, error: entityErr } = await supabase.rpc(
        "ensure_entity_for_firm_client",
        { _project_id: projectId, _client_id: clientId },
      );
      if (entityErr) {
        rows.forEach((r, i) => {
          if (clientMap.get(r.clientName.trim().toLowerCase()) === clientId) {
            errors.push({
              rowIndex: i,
              message: `Entity resolution failed: ${entityErr.message}`,
            });
          }
        });
      } else {
        entityMap.set(clientId, entityId as unknown as string);
      }
    }

    // ── Pass 2b: Validate return type IDs belong to this project ─
    // Prevents FK violations when a UUID is stale, archived, or from another project.

    const uniqueReturnTypeIds = [
      ...new Set(rows.map((r) => r.returnTypeId).filter((id): id is string => !!id)),
    ];
    const validReturnTypeIds = new Set<string>();
    if (uniqueReturnTypeIds.length > 0) {
      const { data: validTypes } = await supabase
        .from("project_return_types")
        .select("id")
        .eq("project_id", projectId)
        .in("id", uniqueReturnTypeIds);
      (validTypes ?? []).forEach((t: { id: string }) => validReturnTypeIds.add(t.id));
    }

    // ── Pass 3: Batch-insert tasks ───────────────────────────────

    const failedRows = new Set(errors.map((e) => e.rowIndex));

    type TaskInsert = {
      entity_id: string;
      client_id: string;
      project_id: string;
      title: string;
      description: string | null;
      status: string;
      priority: string;
      complexity: string;
      period: string | null;
      tax_year: number | null;
      due_date: string | null;
      start_date: string | null;
      return_type_id: string | null;
      display_id: string | null;
      assignee_id: string | null;
      reviewer_id: string | null;
      created_by: string;
    };

    const insertable: {
      rowIndex: number;
      task: TaskInsert;
      assigneeId: string | null;
      reviewerId: string | null;
    }[] = [];

    for (let i = 0; i < rows.length; i++) {
      if (failedRows.has(i)) continue;

      const row = rows[i];
      const clientId = clientMap.get(row.clientName.trim().toLowerCase());
      if (!clientId) {
        errors.push({ rowIndex: i, message: "Client could not be resolved" });
        continue;
      }
      const entityId = entityMap.get(clientId);
      if (!entityId) {
        errors.push({ rowIndex: i, message: "Entity could not be resolved" });
        continue;
      }

      insertable.push({
        rowIndex: i,
        assigneeId: row.assigneeId ?? null,
        reviewerId: row.reviewerId ?? null,
        task: {
          entity_id: entityId,
          client_id: clientId,
          project_id: projectId,
          title: row.title,
          description: row.description ?? null,
          status: row.status,
          priority: row.priority,
          complexity: row.complexity,
          period: row.period ?? null,
          tax_year: row.taxYear ?? null,
          due_date: row.dueDate ?? null,
          start_date: row.startDate ?? null,
          // Only set return_type_id if the UUID belongs to this project (prevents FK violation)
          return_type_id:
            row.returnTypeId && validReturnTypeIds.has(row.returnTypeId) ? row.returnTypeId : null,
          display_id: row.displayId?.trim() || null,
          assignee_id: row.assigneeId ?? null,
          reviewer_id: row.reviewerId ?? null,
          created_by: userId,
        },
      });
    }

    const chunks = chunk(insertable, CHUNK_SIZE);

    type ChunkResult = {
      count: number;
      assigneeRows: { task_id: string; user_id: string; role: string }[];
      chunkErrors: { rowIndex: number; message: string }[];
    };

    const chunkResults = await Promise.all(
      chunks.map(async (batch): Promise<ChunkResult> => {
        const { data: inserted, error: insErr } = await supabase
          .from("tasks")
          .insert(batch.map((b) => b.task))
          .select("id");

        if (insErr) {
          return {
            count: 0,
            assigneeRows: [],
            chunkErrors: batch.map((b) => ({
              rowIndex: b.rowIndex,
              message: insErr.message,
            })),
          };
        }

        const ids = inserted as { id: string }[];
        const assigneeRows: { task_id: string; user_id: string; role: string }[] = [];
        ids.forEach((record, i) => {
          const b = batch[i];
          if (b.assigneeId)
            assigneeRows.push({ task_id: record.id, user_id: b.assigneeId, role: "assignee" });
          if (b.reviewerId)
            assigneeRows.push({ task_id: record.id, user_id: b.reviewerId, role: "reviewer" });
        });

        return { count: ids.length, assigneeRows, chunkErrors: [] };
      }),
    );

    let totalCreated = 0;
    const allAssigneeRows: { task_id: string; user_id: string; role: string }[] = [];
    for (const r of chunkResults) {
      totalCreated += r.count;
      allAssigneeRows.push(...r.assigneeRows);
      errors.push(...r.chunkErrors);
    }

    // ── Pass 4: Write task_assignees join rows ────────────────────

    if (allAssigneeRows.length > 0) {
      const { error: assignErr } = await supabase
        .from("task_assignees")
        .upsert(allAssigneeRows, { onConflict: "task_id,user_id,role" });
      // Non-fatal: tasks are created; log but don't fail the whole import
      if (assignErr) {
        console.warn("[bulk-import] task_assignees upsert failed:", assignErr.message);
      }
    }

    return { created: totalCreated, errors };
  });
