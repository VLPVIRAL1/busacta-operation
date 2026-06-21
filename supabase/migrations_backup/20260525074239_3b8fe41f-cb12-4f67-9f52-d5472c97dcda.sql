-- =========================================================================
-- Billing engine, step 2: tables, triggers, helpers, RLS
-- =========================================================================

-- 0. Firm-level currency (Q1: pricing periods inherit from this)
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD'
    CHECK (currency = upper(currency) AND length(currency) BETWEEN 3 AND 3);

-- 1. RevRec flag on pipeline stages
ALTER TABLE public.project_pipeline_stages
  ADD COLUMN IF NOT EXISTS is_billable  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revrec_label text     NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_billable
  ON public.project_pipeline_stages (project_id) WHERE is_billable;

-- =========================================================================
-- 2. Pricing tables
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.project_pricing_periods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label        text,
  model        public.pricing_model_kind NOT NULL,
  starts_on    date NOT NULL,
  ends_on      date NULL,
  currency     text NULL,
  notes        text,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_period_dates_chk CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT pricing_period_no_overlap EXCLUDE USING gist (
    project_id WITH =,
    daterange(starts_on, COALESCE(ends_on, 'infinity'::date), '[]') WITH &&
  )
);
CREATE INDEX IF NOT EXISTS idx_pricing_periods_project
  ON public.project_pricing_periods (project_id, starts_on DESC);

-- Auto-fill currency from firm on insert (Q1)
CREATE OR REPLACE FUNCTION public.set_pricing_period_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.currency IS NULL THEN
    SELECT f.currency INTO NEW.currency
      FROM public.projects p JOIN public.firms f ON f.id = p.firm_id
     WHERE p.id = NEW.project_id;
    NEW.currency := COALESCE(NEW.currency, 'USD');
  END IF;
  NEW.currency := upper(NEW.currency);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pricing_period_currency ON public.project_pricing_periods;
CREATE TRIGGER trg_pricing_period_currency
  BEFORE INSERT ON public.project_pricing_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_pricing_period_currency();

DROP TRIGGER IF EXISTS trg_pricing_period_updated ON public.project_pricing_periods;
CREATE TRIGGER trg_pricing_period_updated
  BEFORE UPDATE ON public.project_pricing_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Matrix rates (pay_per_task + effective_hours)
CREATE TABLE IF NOT EXISTS public.project_pricing_matrix_rates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id           uuid NOT NULL REFERENCES public.project_pricing_periods(id) ON DELETE CASCADE,
  return_type_id      uuid NOT NULL REFERENCES public.project_return_types(id)      ON DELETE RESTRICT,
  difficulty_level_id uuid NOT NULL REFERENCES public.project_difficulty_levels(id) ON DELETE RESTRICT,
  amount              numeric(14,2) NOT NULL CHECK (amount >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, return_type_id, difficulty_level_id)
);
CREATE INDEX IF NOT EXISTS idx_matrix_period ON public.project_pricing_matrix_rates (period_id);

DROP TRIGGER IF EXISTS trg_matrix_updated ON public.project_pricing_matrix_rates;
CREATE TRIGGER trg_matrix_updated
  BEFORE UPDATE ON public.project_pricing_matrix_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fixed-person assignments
CREATE TABLE IF NOT EXISTS public.project_pricing_fixed_assignments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id            uuid NOT NULL REFERENCES public.project_pricing_periods(id) ON DELETE CASCADE,
  employee_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  difficulty_level_id  uuid NULL REFERENCES public.project_difficulty_levels(id) ON DELETE SET NULL,
  flat_amount          numeric(14,2) NOT NULL CHECK (flat_amount >= 0),
  billing_cadence      text NOT NULL CHECK (billing_cadence IN ('mid_month','month_end','custom')),
  custom_day           int  NULL CHECK (custom_day BETWEEN 1 AND 31),
  last_generated_for   date NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, employee_id)
);

DROP TRIGGER IF EXISTS trg_fixed_updated ON public.project_pricing_fixed_assignments;
CREATE TRIGGER trg_fixed_updated
  BEFORE UPDATE ON public.project_pricing_fixed_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Model/child consistency guard
CREATE OR REPLACE FUNCTION public.enforce_pricing_child_model()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.pricing_model_kind;
BEGIN
  SELECT model INTO m FROM public.project_pricing_periods WHERE id = NEW.period_id;
  IF TG_TABLE_NAME = 'project_pricing_matrix_rates' AND m NOT IN ('pay_per_task','effective_hours') THEN
    RAISE EXCEPTION 'Matrix rates only allowed for pay_per_task or effective_hours periods';
  END IF;
  IF TG_TABLE_NAME = 'project_pricing_fixed_assignments' AND m <> 'fixed_person' THEN
    RAISE EXCEPTION 'Fixed-person assignments only allowed for fixed_person periods';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_matrix_model_guard ON public.project_pricing_matrix_rates;
CREATE TRIGGER trg_matrix_model_guard
  BEFORE INSERT OR UPDATE ON public.project_pricing_matrix_rates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pricing_child_model();

DROP TRIGGER IF EXISTS trg_fixed_model_guard ON public.project_pricing_fixed_assignments;
CREATE TRIGGER trg_fixed_model_guard
  BEFORE INSERT OR UPDATE ON public.project_pricing_fixed_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pricing_child_model();

-- =========================================================================
-- 3. Stage-completion audit
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.task_stage_completions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  stage_id      uuid NOT NULL REFERENCES public.project_pipeline_stages(id) ON DELETE RESTRICT,
  ticked_yes    boolean NOT NULL,
  completed_at  timestamptz NOT NULL DEFAULT now(),
  actor_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note          text
);
CREATE INDEX IF NOT EXISTS idx_stage_compl_task  ON public.task_stage_completions (task_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_compl_stage ON public.task_stage_completions (stage_id, completed_at DESC);

-- =========================================================================
-- 4. Billing ledger
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.task_billable_events (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id                    uuid NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
  project_id                 uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  stage_id                   uuid NULL REFERENCES public.project_pipeline_stages(id) ON DELETE RESTRICT,
  stage_completion_id        uuid NULL REFERENCES public.task_stage_completions(id) ON DELETE RESTRICT,
  time_log_id                uuid NULL REFERENCES public.time_logs(id) ON DELETE RESTRICT,
  fixed_assignment_id        uuid NULL REFERENCES public.project_pricing_fixed_assignments(id) ON DELETE RESTRICT,
  cadence_period_date        date NULL,

  pricing_period_id          uuid NOT NULL REFERENCES public.project_pricing_periods(id) ON DELETE RESTRICT,
  pricing_model_snapshot     public.pricing_model_kind NOT NULL,
  currency_snapshot          text NOT NULL,
  return_type_id_snapshot    uuid NULL,
  difficulty_id_snapshot     uuid NULL,
  effective_minutes_snapshot integer NULL,
  rate_snapshot              numeric(14,2) NULL,
  computed_amount            numeric(14,2) NOT NULL DEFAULT 0,
  override_amount            numeric(14,2) NULL,
  final_amount               numeric(14,2) GENERATED ALWAYS AS
                               (COALESCE(override_amount, computed_amount)) STORED,

  source                     public.billable_event_source NOT NULL,
  status                     public.billable_event_status NOT NULL DEFAULT 'ready',
  completed_at               timestamptz NOT NULL DEFAULT now(),

  deferred_at                timestamptz NULL,
  deferred_by                uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  deferred_reason            text NULL,

  invoice_id                 uuid NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  invoice_line_item_id       uuid NULL REFERENCES public.invoice_line_items(id) ON DELETE SET NULL,
  locked_at                  timestamptz NULL,
  locked_by                  uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  unlocked_at                timestamptz NULL,
  unlocked_by                uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  unlock_reason              text NULL,

  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_task_stage_live
  ON public.task_billable_events (task_id, stage_id)
  WHERE source = 'stage_completion' AND status <> 'superseded';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_time_log
  ON public.task_billable_events (time_log_id)
  WHERE time_log_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_fixed_cadence
  ON public.task_billable_events (fixed_assignment_id, cadence_period_date)
  WHERE source = 'fixed_person_cadence';

CREATE INDEX IF NOT EXISTS idx_events_project_status ON public.task_billable_events (project_id, status);
CREATE INDEX IF NOT EXISTS idx_events_invoice        ON public.task_billable_events (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_backlog        ON public.task_billable_events (status, completed_at);

DROP TRIGGER IF EXISTS trg_events_updated ON public.task_billable_events;
CREATE TRIGGER trg_events_updated
  BEFORE UPDATE ON public.task_billable_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 5. Helpers
-- =========================================================================

CREATE OR REPLACE FUNCTION public.resolve_active_pricing_period(p_project uuid, at timestamptz)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.project_pricing_periods
   WHERE project_id = p_project
     AND at::date >= starts_on
     AND (ends_on IS NULL OR at::date <= ends_on)
   ORDER BY starts_on DESC LIMIT 1
$$;

-- =========================================================================
-- 6. Stage-completion -> ledger (pay_per_task / tbd; skips hourly + fixed)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.on_stage_completion_to_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_billable boolean;
  v_project_id  uuid;
  v_period_id   uuid;
  v_model       public.pricing_model_kind;
  v_currency    text;
  v_rt          uuid;
  v_diff        uuid;
  v_rate        numeric(14,2);
  v_amount      numeric(14,2) := 0;
BEGIN
  SELECT s.is_billable, s.project_id
    INTO v_is_billable, v_project_id
    FROM public.project_pipeline_stages s
   WHERE s.id = NEW.stage_id;

  IF NOT COALESCE(v_is_billable, false) THEN RETURN NEW; END IF;

  v_period_id := public.resolve_active_pricing_period(v_project_id, NEW.completed_at);
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'No active pricing period for project % at %', v_project_id, NEW.completed_at;
  END IF;

  SELECT model, currency INTO v_model, v_currency
    FROM public.project_pricing_periods WHERE id = v_period_id;

  IF v_model IN ('effective_hours','fixed_person') THEN RETURN NEW; END IF;

  IF NEW.ticked_yes THEN
    SELECT t.return_type_id, t.difficulty_level_id
      INTO v_rt, v_diff FROM public.tasks t WHERE t.id = NEW.task_id;

    IF v_model = 'pay_per_task' THEN
      SELECT amount INTO v_rate FROM public.project_pricing_matrix_rates
       WHERE period_id = v_period_id AND return_type_id = v_rt AND difficulty_level_id = v_diff;
      v_amount := COALESCE(v_rate, 0);
    END IF;

    INSERT INTO public.task_billable_events (
      task_id, project_id, stage_id, stage_completion_id,
      pricing_period_id, pricing_model_snapshot, currency_snapshot,
      return_type_id_snapshot, difficulty_id_snapshot,
      rate_snapshot, computed_amount,
      source, status, completed_at
    ) VALUES (
      NEW.task_id, v_project_id, NEW.stage_id, NEW.id,
      v_period_id, v_model, v_currency,
      v_rt, v_diff,
      v_rate, v_amount,
      'stage_completion', 'ready', NEW.completed_at
    )
    ON CONFLICT DO NOTHING;
  ELSE
    IF EXISTS (SELECT 1 FROM public.task_billable_events
                WHERE task_id = NEW.task_id AND stage_id = NEW.stage_id
                  AND source = 'stage_completion'
                  AND status = 'invoiced' AND invoice_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Cannot un-complete stage: tied to invoiced billable event. Ask a Super Admin to unlock first.';
    END IF;

    UPDATE public.task_billable_events
       SET status = 'superseded', updated_at = now()
     WHERE task_id = NEW.task_id AND stage_id = NEW.stage_id
       AND source = 'stage_completion'
       AND status IN ('ready','deferred')
       AND invoice_id IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stage_completion_to_ledger ON public.task_stage_completions;
CREATE TRIGGER trg_stage_completion_to_ledger
  AFTER INSERT ON public.task_stage_completions
  FOR EACH ROW EXECUTE FUNCTION public.on_stage_completion_to_ledger();

-- =========================================================================
-- 7. Time-log -> ledger (effective_hours; un-gated by stage; Q2)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.on_time_log_to_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project uuid; v_period uuid; v_model public.pricing_model_kind; v_currency text;
  v_rt uuid; v_diff uuid; v_rate numeric(14,2); v_amount numeric(14,2);
  v_eff int;
BEGIN
  IF NEW.ended_at IS NULL THEN RETURN NEW; END IF;

  SELECT t.project_id, t.return_type_id, t.difficulty_level_id
    INTO v_project, v_rt, v_diff FROM public.tasks t WHERE t.id = NEW.task_id;
  IF v_project IS NULL THEN RETURN NEW; END IF;

  v_period := public.resolve_active_pricing_period(v_project, NEW.ended_at);
  IF v_period IS NULL THEN RETURN NEW; END IF;

  SELECT model, currency INTO v_model, v_currency FROM public.project_pricing_periods WHERE id = v_period;
  IF v_model <> 'effective_hours' THEN RETURN NEW; END IF;

  SELECT amount INTO v_rate FROM public.project_pricing_matrix_rates
   WHERE period_id = v_period AND return_type_id = v_rt AND difficulty_level_id = v_diff;

  v_eff := CASE WHEN COALESCE(NEW.billable, false) THEN COALESCE(NEW.effective_minutes, 0) ELSE 0 END;
  v_amount := ROUND((COALESCE(v_rate,0) * v_eff / 60.0)::numeric, 2);

  INSERT INTO public.task_billable_events (
    task_id, project_id, time_log_id,
    pricing_period_id, pricing_model_snapshot, currency_snapshot,
    return_type_id_snapshot, difficulty_id_snapshot,
    effective_minutes_snapshot, rate_snapshot, computed_amount,
    source, status, completed_at
  ) VALUES (
    NEW.task_id, v_project, NEW.id,
    v_period, v_model, v_currency,
    v_rt, v_diff,
    v_eff, v_rate, v_amount,
    'time_log', 'ready', NEW.ended_at
  )
  ON CONFLICT (time_log_id) WHERE time_log_id IS NOT NULL DO UPDATE
    SET effective_minutes_snapshot = EXCLUDED.effective_minutes_snapshot,
        computed_amount            = EXCLUDED.computed_amount,
        rate_snapshot              = EXCLUDED.rate_snapshot,
        currency_snapshot          = EXCLUDED.currency_snapshot,
        updated_at                 = now()
  WHERE public.task_billable_events.invoice_id IS NULL;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_time_log_to_ledger ON public.time_logs;
CREATE TRIGGER trg_time_log_to_ledger
  AFTER INSERT OR UPDATE OF ended_at, effective_override, duration_minutes, break_minutes, billable
  ON public.time_logs FOR EACH ROW EXECUTE FUNCTION public.on_time_log_to_ledger();

-- =========================================================================
-- 8. Fixed-person cadence generator (called by cron daily)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.generate_fixed_person_cadence(p_today date DEFAULT CURRENT_DATE)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_due date; v_inserted int := 0;
BEGIN
  FOR r IN
    SELECT fa.id, fa.period_id, fa.employee_id, fa.difficulty_level_id, fa.flat_amount,
           fa.billing_cadence, fa.custom_day, fa.last_generated_for,
           pp.project_id, pp.currency
      FROM public.project_pricing_fixed_assignments fa
      JOIN public.project_pricing_periods pp ON pp.id = fa.period_id
     WHERE pp.starts_on <= p_today
       AND (pp.ends_on IS NULL OR pp.ends_on >= p_today)
  LOOP
    v_due := CASE r.billing_cadence
      WHEN 'mid_month' THEN date_trunc('month', p_today)::date + 14
      WHEN 'month_end' THEN (date_trunc('month', p_today) + interval '1 month - 1 day')::date
      WHEN 'custom'    THEN date_trunc('month', p_today)::date + (r.custom_day - 1)
    END;

    IF v_due <= p_today AND (r.last_generated_for IS NULL OR r.last_generated_for < v_due) THEN
      INSERT INTO public.task_billable_events (
        project_id, fixed_assignment_id, cadence_period_date,
        pricing_period_id, pricing_model_snapshot, currency_snapshot,
        difficulty_id_snapshot, rate_snapshot, computed_amount,
        source, status, completed_at
      ) VALUES (
        r.project_id, r.id, v_due,
        r.period_id, 'fixed_person', r.currency,
        r.difficulty_level_id, r.flat_amount, r.flat_amount,
        'fixed_person_cadence', 'ready', v_due::timestamptz
      )
      ON CONFLICT DO NOTHING;

      UPDATE public.project_pricing_fixed_assignments
         SET last_generated_for = v_due
       WHERE id = r.id;
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;
  RETURN v_inserted;
END $$;

-- =========================================================================
-- 9. Lock + defer guard on ledger
-- =========================================================================

CREATE OR REPLACE FUNCTION public.enforce_billable_event_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.invoice_id IS NOT NULL AND OLD.status = 'invoiced' THEN
    -- Super-admin recall path
    IF NEW.status = 'recalled' AND public.has_role(auth.uid(), 'super_admin') THEN
      NEW.unlocked_at  := COALESCE(NEW.unlocked_at, now());
      NEW.unlocked_by  := COALESCE(NEW.unlocked_by, auth.uid());
      RETURN NEW;
    END IF;
    IF NEW.invoice_id                IS DISTINCT FROM OLD.invoice_id
    OR NEW.override_amount           IS DISTINCT FROM OLD.override_amount
    OR NEW.effective_minutes_snapshot IS DISTINCT FROM OLD.effective_minutes_snapshot
    OR NEW.rate_snapshot             IS DISTINCT FROM OLD.rate_snapshot
    OR NEW.return_type_id_snapshot   IS DISTINCT FROM OLD.return_type_id_snapshot
    OR NEW.difficulty_id_snapshot    IS DISTINCT FROM OLD.difficulty_id_snapshot
    OR NEW.pricing_period_id         IS DISTINCT FROM OLD.pricing_period_id
    OR NEW.status                    IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Billable event is locked to an invoice. Super Admin must unlock first.';
    END IF;
  END IF;

  IF NEW.status = 'deferred' AND OLD.status NOT IN ('ready','deferred') THEN
    RAISE EXCEPTION 'Only ready events may be deferred';
  END IF;
  IF NEW.status = 'deferred' AND NEW.deferred_at IS NULL THEN
    NEW.deferred_at := now();
    NEW.deferred_by := auth.uid();
  END IF;
  IF OLD.status = 'deferred' AND NEW.status = 'ready' THEN
    NEW.deferred_at := NULL; NEW.deferred_by := NULL; NEW.deferred_reason := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_billable_event_lock ON public.task_billable_events;
CREATE TRIGGER trg_billable_event_lock
  BEFORE UPDATE ON public.task_billable_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_billable_event_immutability();

-- Invoice void/cancel -> recall linked ledger rows
CREATE OR REPLACE FUNCTION public.on_invoice_voided_recall_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('void','cancelled') AND OLD.status <> NEW.status THEN
    UPDATE public.task_billable_events
       SET status = 'ready',
           invoice_id = NULL,
           invoice_line_item_id = NULL,
           locked_at = NULL, locked_by = NULL,
           unlocked_at = now(), unlocked_by = auth.uid(),
           unlock_reason = COALESCE(unlock_reason,'invoice_voided')
     WHERE invoice_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_recall_cascade ON public.invoices;
CREATE TRIGGER trg_invoice_recall_cascade
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.on_invoice_voided_recall_events();

-- =========================================================================
-- 10. RLS
-- =========================================================================

ALTER TABLE public.project_pricing_periods           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_pricing_matrix_rates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_pricing_fixed_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_stage_completions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_billable_events              ENABLE ROW LEVEL SECURITY;

-- Pricing periods
CREATE POLICY pricing_periods_admin_all ON public.project_pricing_periods
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY pricing_periods_finance_read ON public.project_pricing_periods
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance_manager'));

-- Matrix rates
CREATE POLICY matrix_admin_all ON public.project_pricing_matrix_rates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY matrix_finance_read ON public.project_pricing_matrix_rates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance_manager'));

-- Fixed assignments
CREATE POLICY fixed_admin_all ON public.project_pricing_fixed_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY fixed_finance_read ON public.project_pricing_fixed_assignments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance_manager'));

-- Stage completions: ops/admin/super_admin write; admin+super+finance read
CREATE POLICY stage_compl_insert ON public.task_stage_completions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'employee')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
  );
CREATE POLICY stage_compl_read ON public.task_stage_completions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'employee')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'finance_manager')
  );

-- Billing ledger
CREATE POLICY events_read ON public.task_billable_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'finance_manager')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
  );
-- Finance/admin/super may update while unlocked; the immutability trigger
-- still blocks edits when invoice_id is set.
CREATE POLICY events_update_unlocked ON public.task_billable_events
  FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(),'finance_manager')
     OR public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'super_admin'))
    AND invoice_id IS NULL
  )
  WITH CHECK (
    public.has_role(auth.uid(),'finance_manager')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
  );
-- Super_admin may always update (covers the recall path on locked rows)
CREATE POLICY events_update_super ON public.task_billable_events
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- No INSERT policy on task_billable_events: rows enter only via SECURITY DEFINER
-- triggers / generators. No DELETE policy: rows are append-only by design.