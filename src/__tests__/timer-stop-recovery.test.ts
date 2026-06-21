import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client BEFORE importing the module under test.
type Row = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes?: number | null;
};
const state: { rows: Row[]; updateError: Error | null; selectError: Error | null } = {
  rows: [],
  updateError: null,
  selectError: null,
};

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
      maybeSingle: async () => {
        if (state.selectError) return { data: null, error: state.selectError };
        const matched = state.rows.filter((r) => builder._filters.every((f: any) => f(r)));
        return { data: matched[0] ?? null, error: null };
      },
      then(resolve: any) {
        if (state.selectError) return resolve({ data: null, error: state.selectError });
        const matched = state.rows.filter((r) => builder._filters.every((f: any) => f(r)));
        return resolve({ data: matched, error: null });
      },
      update(patch: Partial<Row>) {
        const upd: any = {
          _filters: [] as Array<(r: Row) => boolean>,
          eq(col: string, val: any) {
            upd._filters.push((r: any) => r[col] === val);
            return upd;
          },
          then(resolve: any) {
            if (state.updateError) return resolve({ error: state.updateError });
            for (const r of state.rows) {
              if (upd._filters.every((f: any) => f(r))) Object.assign(r, patch);
            }
            return resolve({ error: null });
          },
        };
        return upd;
      },
    };
    return builder;
  }
  return {
    supabase: {
      from,
      channel: () => ({
        on() {
          return this;
        },
        subscribe() {
          return this;
        },
      }),
      removeChannel: () => {},
    },
  };
});

import {
  forceStopAllOpenTimers,
  TIMER_START_KEY,
  TIMER_STOP_KEY,
  TIMER_FORCE_STOP_KEY,
} from "@/components/ops/timer-widget";

beforeEach(() => {
  state.rows = [];
  state.updateError = null;
  state.selectError = null;
});

describe("timer mutation keys are distinct", () => {
  it("Start, Stop, and Force-Stop use different mutation keys so a pending start cannot block stop", () => {
    expect(JSON.stringify(TIMER_START_KEY)).not.toEqual(JSON.stringify(TIMER_STOP_KEY));
    expect(JSON.stringify(TIMER_STOP_KEY)).not.toEqual(JSON.stringify(TIMER_FORCE_STOP_KEY));
    expect(JSON.stringify(TIMER_START_KEY)).not.toEqual(JSON.stringify(TIMER_FORCE_STOP_KEY));
  });
});

describe("forceStopAllOpenTimers — stuck-recovery flow", () => {
  it("closes every open timer for the user (covers navigate-away + start-another scenarios)", async () => {
    const userId = "u1";
    const start = new Date(Date.now() - 10 * 60_000).toISOString();
    state.rows = [
      { id: "a", user_id: userId, started_at: start, ended_at: null },
      { id: "b", user_id: userId, started_at: start, ended_at: null },
      { id: "c", user_id: "other", started_at: start, ended_at: null },
    ];

    const closed = await forceStopAllOpenTimers(userId);
    expect(closed).toBe(2);
    expect(state.rows.find((r) => r.id === "a")!.ended_at).toBeTruthy();
    expect(state.rows.find((r) => r.id === "b")!.ended_at).toBeTruthy();
    // never touches another user's open timer
    expect(state.rows.find((r) => r.id === "c")!.ended_at).toBeNull();
  });

  it("returns 0 when nothing is open (idempotent)", async () => {
    state.rows = [
      {
        id: "a",
        user_id: "u1",
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
      },
    ];
    const closed = await forceStopAllOpenTimers("u1");
    expect(closed).toBe(0);
  });

  it("propagates a supabase update error so the UI can toast it", async () => {
    state.rows = [{ id: "a", user_id: "u1", started_at: new Date().toISOString(), ended_at: null }];
    state.updateError = new Error("network down");
    await expect(forceStopAllOpenTimers("u1")).rejects.toThrow(/network down/);
  });

  it("propagates a supabase select error", async () => {
    state.selectError = new Error("permission denied");
    await expect(forceStopAllOpenTimers("u1")).rejects.toThrow(/permission denied/);
  });
});
