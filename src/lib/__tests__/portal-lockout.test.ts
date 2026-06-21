import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the admin client BEFORE importing the helpers under test.
const mock = {
  rolesRows: [] as { role: string }[],
  contactsRows: [] as { id: string; portal_enabled: boolean }[],
  profile: { email: "alice@example.com", portal_enabled: false } as any,
  updates: [] as { table: string; patch: any }[],
  deletes: [] as { table: string; filters: any }[],
};

vi.mock("@/integrations/supabase/client.server", () => {
  const make = (table: string): any => ({
    select: (..._args: any[]) => ({
      eq: () => ({ maybeSingle: async () => ({ data: mock.profile }) }),
      ilike: async () => ({ data: mock.contactsRows }),
      _eq2: async () => ({ data: mock.rolesRows }),
    }),
    update: (patch: any) => ({
      eq: async () => {
        mock.updates.push({ table, patch });
        if (table === "profiles" && "portal_enabled" in patch) {
          mock.profile.portal_enabled = patch.portal_enabled;
        }
        return { error: null };
      },
      ilike: async () => {
        mock.updates.push({ table, patch });
        mock.contactsRows = mock.contactsRows.map((c) => ({ ...c, portal_enabled: false }));
        return { error: null };
      },
    }),
    delete: () => ({
      eq: (col1: string, val1: any) => ({
        eq: async (col2: string, val2: any) => {
          mock.deletes.push({ table, filters: { [col1]: val1, [col2]: val2 } });
          if (table === "user_roles" && val2 === "client") {
            mock.rolesRows = mock.rolesRows.filter((r) => r.role !== "client");
          }
          return { error: null };
        },
      }),
    }),
  });

  // user_roles.select(...).eq(...) returns { data } directly (no maybeSingle).
  const userRolesClient: any = {
    select: () => ({
      eq: async () => ({ data: mock.rolesRows }),
    }),
    delete: () => ({
      eq: (col1: string, val1: any) => ({
        eq: async (_col2: string, val2: any) => {
          mock.deletes.push({ table: "user_roles", filters: { [col1]: val1, role: val2 } });
          if (val2 === "client") mock.rolesRows = mock.rolesRows.filter((r) => r.role !== "client");
          return { error: null };
        },
      }),
    }),
  };

  return {
    supabaseAdmin: {
      from: (table: string) => {
        if (table === "user_roles") return userRolesClient;
        if (table === "firm_contacts") {
          return {
            select: () => ({
              ilike: async () => ({ data: mock.contactsRows }),
            }),
            update: (patch: any) => ({
              ilike: async () => {
                mock.updates.push({ table, patch });
                mock.contactsRows = mock.contactsRows.map((c) => ({ ...c, portal_enabled: false }));
                return { error: null };
              },
            }),
          };
        }
        return make(table);
      },
    },
  };
});

import { enforcePortalLockout, verifyPortalLockout } from "@/lib/hr/portal-lockout.server";

beforeEach(() => {
  mock.rolesRows = [{ role: "client" }, { role: "employee" }];
  mock.contactsRows = [{ id: "c1", portal_enabled: true }];
  mock.profile = { email: "alice@example.com", portal_enabled: true };
  mock.updates = [];
  mock.deletes = [];
});

describe("portal lockout", () => {
  it("removes the client role, disables portal flag, and clears firm_contacts", async () => {
    await enforcePortalLockout("user-1");
    expect(mock.deletes.some((d) => d.table === "user_roles" && d.filters.role === "client")).toBe(
      true,
    );
    expect(
      mock.updates.some((u) => u.table === "profiles" && u.patch.portal_enabled === false),
    ).toBe(true);
    expect(mock.contactsRows.every((c) => c.portal_enabled === false)).toBe(true);
  });

  it("verify reports ok=true after enforcement", async () => {
    await enforcePortalLockout("user-1");
    const r = await verifyPortalLockout("user-1");
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("verify reports issues if portal flag is still true", async () => {
    mock.profile.portal_enabled = true;
    const r = await verifyPortalLockout("user-1");
    expect(r.ok).toBe(false);
    expect(r.issues.join(";")).toMatch(/portal_enabled/);
  });
});
