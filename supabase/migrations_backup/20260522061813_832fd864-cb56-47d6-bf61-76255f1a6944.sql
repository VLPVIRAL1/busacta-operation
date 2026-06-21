
-- Budget Journal audit trail
CREATE TABLE public.budget_journal_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table text NOT NULL CHECK (target_table IN ('budget_journals','budget_journal_lines')),
  op           text NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),
  journal_id   uuid NOT NULL,
  line_id      uuid,
  actor_id     uuid,
  before_data  jsonb,
  after_data   jsonb,
  at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bja_journal ON public.budget_journal_audit (journal_id, at DESC);
CREATE INDEX idx_bja_target  ON public.budget_journal_audit (target_table, at DESC);

ALTER TABLE public.budget_journal_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can read budget audit"
  ON public.budget_journal_audit FOR SELECT
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
    OR public.has_role(auth.uid(),'finance_manager'::public.app_role)
  );

-- Trigger fn for budget_journals
CREATE OR REPLACE FUNCTION public.log_budget_journal_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.budget_journal_audit(target_table, op, journal_id, actor_id, after_data)
    VALUES ('budget_journals','INSERT', NEW.id, auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW) - 'updated_at' <> to_jsonb(OLD) - 'updated_at' THEN
      INSERT INTO public.budget_journal_audit(target_table, op, journal_id, actor_id, before_data, after_data)
      VALUES ('budget_journals','UPDATE', NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.budget_journal_audit(target_table, op, journal_id, actor_id, before_data)
    VALUES ('budget_journals','DELETE', OLD.id, auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_log_budget_journal_change
  AFTER INSERT OR UPDATE OR DELETE ON public.budget_journals
  FOR EACH ROW EXECUTE FUNCTION public.log_budget_journal_change();

-- Trigger fn for budget_journal_lines
CREATE OR REPLACE FUNCTION public.log_budget_journal_line_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.budget_journal_audit(target_table, op, journal_id, line_id, actor_id, after_data)
    VALUES ('budget_journal_lines','INSERT', NEW.budget_journal_id, NEW.id, auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW) - 'updated_at' <> to_jsonb(OLD) - 'updated_at' THEN
      INSERT INTO public.budget_journal_audit(target_table, op, journal_id, line_id, actor_id, before_data, after_data)
      VALUES ('budget_journal_lines','UPDATE', NEW.budget_journal_id, NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.budget_journal_audit(target_table, op, journal_id, line_id, actor_id, before_data)
    VALUES ('budget_journal_lines','DELETE', OLD.budget_journal_id, OLD.id, auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_log_budget_journal_line_change
  AFTER INSERT OR UPDATE OR DELETE ON public.budget_journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.log_budget_journal_line_change();
