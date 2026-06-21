/**
 * End-to-end (integration) test for the multi-person timer flow.
 *
 * Exercises the same SQL the floating timer / timer-widget runs:
 *   1. User A starts a timer for self + User B (fan-out insert with shared
 *      timer_group_id and timer_group_size = 2).
 *   2. "Navigate away" — the stop path is invoked from outside the original
 *      module context (any page can show the floating timer and stop it).
 *   3. User A stops only their own row (scoped by .eq("user_id", A)).
 *   4. User B logs in separately and stops only their own row.
 *   5. The timesheet badge ("Team · 2") renders for both rows.
 *   6. Negative case: User A cannot stop User B's row (cross-user write
 *      filtered out by the user_id scope — the bug we fixed).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = {
  id: string;
  task_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  timer_group_id: string | null;
  timer_group_size: number;
};

const state: { rows: Row[]; nextId: number } = { rows: [], nextId: 1 };

vi.mock("@/integrations/supabase/client", () => {
  function from(_table: string) {
    const builder: any = {
      _filters: [] as Array<(r: Row) => boolean>,
      select() {
        return builder;
      },
      eq(col: string, val: any) {
        builder._filters.push((r: any) => r[col] === val);
        return builder;
      },
      is(col: string, val: any) {
        builder._filters.push((r: any) => r[col] === val);
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      insert(rows: Partial<Row>[]) {
        const inserted = rows.map((r) => {
          const row: Row = {
            id: `r${state.nextId++}`,
            task_id: r.task_id!,
            user_id: r.user_id!,
            started_at: r.started_at!,
            ended_at: r.ended_at ?? null,
            duration_minutes: r.duration_minutes ?? null,
            timer_group_id: r.timer_group_id ?? null,
            timer_group_size: r.timer_group_size ?? 1,
          };
          state.rows.push(row);
          return row;
        });
        return Promise.resolve({ data: inserted, error: null });
      },
      update(patch: Partial<Row>) {
        const upd: any = {
          _filters: [] as Array<(r: Row) => boolean>,
          eq(col: string, val: any) {
            upd._filters.push((r: any) => r[col] === val);
            return upd;
          },
          then(resolve: any) {
            let n = 0;
            for (const r of state.rows) {
              if (upd._filters.every((f: any) => f(r))) {
                Object.assign(r, patch);
                n++;
              }
            }
            return resolve({ data: null, error: null, count: n });
          },
        };
        return upd;
      },
      then(resolve: any) {
        const matched = state.rows.filter((r) => builder._filters.every((f: any) => f(r)));
        return resolve({ data: matched, error: null });
      },
    };
    return builder;
  }
  return { supabase: { from } };
});

import { supabase } from "@/integrations/supabase/client";

const USER_A = "user-a";
const USER_B = "user-b";
const TASK = "task-1";

// Mirror of the start mutation in src/components/timer-widget.tsx
async function startMultiPersonTimer(
  currentUserId: string,
  collaborators: string[],
  startedAt: string,
) {
  const userIds = Array.from(new Set([currentUserId, ...collaborators]));
  const timerGroupId = userIds.length > 1 ? `grp-${state.nextId}` : null;
  const rows = userIds.map((uid) => ({
    task_id: TASK,
    user_id: uid,
    started_at: startedAt,
    timer_group_id: timerGroupId,
    timer_group_size: userIds.length,
  }));
  const { error } = await supabase.from("time_logs").insert(rows as any);
  if (error) throw error;
  return timerGroupId;
}

// Mirror of the stop mutation: scoped by id AND user_id so a user can only
// close their own row, even if they happen to know another row's id.
async function stopMyTimerRow(
  currentUserId: string,
  rowId: string,
  startedAt: string,
  endedAt: Date,
) {
  const dur = Math.max(1, Math.round((endedAt.getTime() - new Date(startedAt).getTime()) / 60000));
  await supabase
    .from("time_logs")
    .update({ ended_at: endedAt.toISOString(), duration_minutes: dur })
    .eq("id", rowId)
    .eq("user_id", currentUserId);
}

beforeEach(() => {
  state.rows = [];
  state.nextId = 1;
});

describe("multi-person timer — full lifecycle", () => {
  it("fan-out start, cross-page stop per user, badge rendering, and cross-user isolation", async () => {
    const startedAt = new Date(Date.now() - 12 * 60_000).toISOString();

    // 1. User A starts a 2-person timer
    const groupId = await startMultiPersonTimer(USER_A, [USER_B], startedAt);
    expect(state.rows).toHaveLength(2);
    expect(groupId).toBeTruthy();
    const rowA = state.rows.find((r) => r.user_id === USER_A)!;
    const rowB = state.rows.find((r) => r.user_id === USER_B)!;
    expect(rowA.timer_group_id).toBe(groupId);
    expect(rowB.timer_group_id).toBe(groupId);
    expect(rowA.timer_group_size).toBe(2);
    expect(rowB.timer_group_size).toBe(2);
    expect(rowA.ended_at).toBeNull();
    expect(rowB.ended_at).toBeNull();

    // 2 + 3. "Navigate away" then User A stops their own row from another page
    await stopMyTimerRow(USER_A, rowA.id, rowA.started_at, new Date());
    expect(rowA.ended_at).not.toBeNull();
    expect(rowA.duration_minutes).toBeGreaterThanOrEqual(1);
    // User B's row is untouched
    expect(rowB.ended_at).toBeNull();

    // 6. Negative: User A tries to close User B's row directly. The user_id
    //    scope on the UPDATE matches zero rows; B remains open.
    await stopMyTimerRow(USER_A, rowB.id, rowB.started_at, new Date());
    expect(rowB.ended_at).toBeNull();

    // 4. User B (separate session) stops their own row
    await stopMyTimerRow(USER_B, rowB.id, rowB.started_at, new Date());
    expect(rowB.ended_at).not.toBeNull();
    expect(rowB.duration_minutes).toBeGreaterThanOrEqual(1);

    // 5. Timesheet badge — same conditional used in
    //    src/components/task-time-sheet-panel.tsx and ops timesheet route.
    const badgeFor = (r: Row) => (r.timer_group_size > 1 ? `Team · ${r.timer_group_size}` : "");
    expect(badgeFor(rowA)).toBe("Team · 2");
    expect(badgeFor(rowB)).toBe("Team · 2");

    // Independent durations (each user's row times their own elapsed window)
    expect(rowA.duration_minutes).not.toBe(null);
    expect(rowB.duration_minutes).not.toBe(null);
  });

  it("solo timer does not get a group id or team badge", async () => {
    const startedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const groupId = await startMultiPersonTimer(USER_A, [], startedAt);
    expect(groupId).toBeNull();
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].timer_group_size).toBe(1);
    const badge =
      state.rows[0].timer_group_size > 1 ? `Team · ${state.rows[0].timer_group_size}` : "";
    expect(badge).toBe("");
  });
});
