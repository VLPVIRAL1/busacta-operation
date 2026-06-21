import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCallerCanManageHr } from "./employees.server";
import {
  getOrgTreeServer,
  listDescendantIdsServer,
  listHierarchyHistoryServer,
  setManagersServer,
  type HierarchyHistoryRow,
  type OrgNode,
} from "./hierarchy.server";

export type { OrgNode, HierarchyHistoryRow };

export const getOrgTree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const nodes = await getOrgTreeServer();
    return { nodes };
  });

const setManagersSchema = z.object({
  employeeId: z.string().uuid(),
  managerIds: z.array(z.string().uuid()).max(20),
});

export const setManagers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setManagersSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return setManagersServer({
      employeeId: data.employeeId,
      managerIds: data.managerIds,
      actorId: context.userId,
    });
  });

const descSchema = z.object({ employeeId: z.string().uuid() });

export const listDescendantIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => descSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    const ids = await listDescendantIdsServer(data.employeeId);
    return { ids };
  });

const historySchema = z.object({
  employeeId: z.string().uuid().nullable().optional(),
  actorId: z.string().uuid().nullable().optional(),
  fromDate: z.string().nullable().optional(),
  toDate: z.string().nullable().optional(),
  search: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const listHierarchyHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => historySchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return listHierarchyHistoryServer(data);
  });

const exportSchema = z.object({
  employeeId: z.string().uuid().nullable().optional(),
  actorId: z.string().uuid().nullable().optional(),
  fromDate: z.string().nullable().optional(),
  toDate: z.string().nullable().optional(),
  search: z.string().nullable().optional(),
  scope: z.enum(["filtered", "all"]).default("filtered"),
});

export const exportHierarchyHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => exportSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    const filters =
      data.scope === "all"
        ? { unlimited: true as const }
        : {
            employeeId: data.employeeId ?? null,
            actorId: data.actorId ?? null,
            fromDate: data.fromDate ?? null,
            toDate: data.toDate ?? null,
            search: data.search ?? null,
            unlimited: true as const,
          };
    return listHierarchyHistoryServer(filters);
  });
