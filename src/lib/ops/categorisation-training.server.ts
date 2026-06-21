// Server-only training core for document categorisation.
//
// Kept in a dedicated `.server.ts` module so the client-imported
// `categorisation.functions.ts` does not pull the service-role admin client
// (`client.server`) into the browser bundle. These functions use `supabaseAdmin`
// at module scope (and are exported), so they must NOT live in a file that any
// client route imports directly. They are consumed only by server functions
// (categorisation.functions.ts handlers) and the cron tick endpoint.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { trainNaiveBayes, type TrainingSample } from "./categorisation-ml";
import type { TrainingSchedule } from "./categorisation.functions";

const TRAINING_SETTINGS_ID = "categorisation_training";

const DEFAULT_SCHEDULE: TrainingSchedule = {
  enabled: true,
  mode: "interval",
  interval_hours: 24,
  times: ["02:00"],
  min_gap_minutes: 60,
  last_run_at: null,
  last_run_status: null,
  last_run_summary: null,
};

export async function readSchedule(): Promise<TrainingSchedule> {
  const { data } = await supabaseAdmin
    .from("app_settings" as never)
    .select("value")
    .eq("id", TRAINING_SETTINGS_ID)
    .maybeSingle();
  const value = (data as { value?: Partial<TrainingSchedule> } | null)?.value ?? {};
  return { ...DEFAULT_SCHEDULE, ...value };
}

export async function writeSchedule(patch: Partial<TrainingSchedule>): Promise<void> {
  const current = await readSchedule();
  const next = { ...current, ...patch };
  await supabaseAdmin.from("app_settings" as never).upsert({
    id: TRAINING_SETTINGS_ID,
    value: next,
    updated_at: new Date().toISOString(),
  } as never);
}

// Shared training core — used by the manual button, the scheduled tick, and the
// cron endpoint. Trains from human-verified + Gemini-labelled samples, activates
// the new model, and records the run on the schedule.
export async function runCategorisationTraining(includeGeminiLabelled = true): Promise<{
  ok: boolean;
  message?: string;
  sampleCount: number;
  classes?: number;
  perClassCounts?: Record<string, number>;
}> {
  const { data: rows, error } = await supabaseAdmin
    .from("doc_categorisation_results" as never)
    .select("doc_type, segment_text, status")
    .in("status", ["confirmed", "overridden", "gemini_labelled"])
    .not("segment_text", "is", null);
  if (error) throw new Error(error.message);

  const samples: TrainingSample[] = (
    (rows ?? []) as Array<{ doc_type: string | null; segment_text: string | null; status: string }>
  )
    .filter((r) => r.doc_type && r.segment_text)
    .map((r) => ({
      text: r.segment_text as string,
      label: r.doc_type as string,
      status: r.status,
    }));

  if (samples.length === 0) {
    await writeSchedule({
      last_run_at: new Date().toISOString(),
      last_run_status: "skipped",
      last_run_summary: "No labeled training samples yet.",
    });
    return { ok: false, message: "No labeled training samples yet.", sampleCount: 0 };
  }

  const model = trainNaiveBayes(samples, { includeGeminiLabelled });

  await supabaseAdmin
    .from("categorisation_ml_model" as never)
    .update({ is_active: false } as never)
    .eq("is_active", true);

  const { error: insErr } = await supabaseAdmin.from("categorisation_ml_model" as never).insert({
    model_json: model,
    vocab_size: model.vocabSize,
    sample_count: model.sampleCount,
    per_class_counts: model.perClassCounts,
    is_active: true,
  } as never);
  if (insErr) throw new Error(insErr.message);

  await writeSchedule({
    last_run_at: new Date().toISOString(),
    last_run_status: "ok",
    last_run_summary: `Trained on ${model.sampleCount} samples across ${model.classes.length} types.`,
  });

  return {
    ok: true,
    sampleCount: model.sampleCount,
    classes: model.classes.length,
    perClassCounts: model.perClassCounts,
  };
}

// Pure scheduling decision — exported for unit testing.
export function isTrainingDue(schedule: TrainingSchedule, now: Date): boolean {
  if (!schedule.enabled) return false;

  const last = schedule.last_run_at ? new Date(schedule.last_run_at) : null;
  if (last && now.getTime() - last.getTime() < schedule.min_gap_minutes * 60_000) {
    return false; // de-dupe guard against rapid ticks
  }

  if (schedule.mode === "interval") {
    if (!last) return true;
    // 60s tolerance so a tick slightly early still counts.
    return now.getTime() - last.getTime() >= schedule.interval_hours * 3_600_000 - 60_000;
  }

  // 'times' mode: fire if we've passed a configured slot today we haven't run for.
  for (const t of schedule.times) {
    const [hh, mm] = t.split(":").map((x) => Number(x));
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
    const slot = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0),
    );
    if (now.getTime() >= slot.getTime() && (!last || last.getTime() < slot.getTime())) {
      return true;
    }
  }
  return false;
}

// Called by the cron tick endpoint. Decides whether a run is due and, if so,
// trains. Returns a small status object (no auth — the endpoint guards via secret).
export async function runScheduledTrainingTick(): Promise<{ ran: boolean; reason: string }> {
  const schedule = await readSchedule();
  if (!isTrainingDue(schedule, new Date())) {
    return { ran: false, reason: schedule.enabled ? "not_scheduled" : "disabled" };
  }
  const result = await runCategorisationTraining(true);
  return { ran: true, reason: result.ok ? "trained" : (result.message ?? "no_samples") };
}
