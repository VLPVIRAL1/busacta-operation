
-- 1.1 bank_accounts: account type discriminator
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'bank'
    CHECK (account_type IN ('bank','credit_card')),
  ADD COLUMN IF NOT EXISTS account_subtype text
    CHECK (account_subtype IS NULL OR account_subtype IN
      ('checking','savings','current','corporate_card','personal_card'));
CREATE INDEX IF NOT EXISTS bank_accounts_type_idx ON public.bank_accounts(account_type);

-- 1.2 bank_feed_lines: smart-lookup linkage
ALTER TABLE public.bank_feed_lines
  ADD COLUMN IF NOT EXISTS merchant_token text,
  ADD COLUMN IF NOT EXISTS suggestion_source text
    CHECK (suggestion_source IS NULL OR suggestion_source IN ('rule','history')),
  ADD COLUMN IF NOT EXISTS suggestion_confidence numeric(4,3);
CREATE INDEX IF NOT EXISTS bank_feed_lines_merchant_token_idx ON public.bank_feed_lines(merchant_token);

-- 1.3 bank_merchant_memory
CREATE TABLE IF NOT EXISTS public.bank_merchant_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  merchant_token text NOT NULL,
  description_sample text NOT NULL,
  vendor_id uuid NULL REFERENCES public.vendors(id) ON DELETE SET NULL,
  category_account_id uuid NULL REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  default_book_tag book_tag NOT NULL DEFAULT 'both',
  hit_count int NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_merchant_memory_uniq
  ON public.bank_merchant_memory (COALESCE(firm_id, '00000000-0000-0000-0000-000000000000'::uuid), merchant_token);
CREATE INDEX IF NOT EXISTS bank_merchant_memory_token_idx ON public.bank_merchant_memory(merchant_token);

ALTER TABLE public.bank_merchant_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_merchant_memory_read" ON public.bank_merchant_memory;
CREATE POLICY "bank_merchant_memory_read" ON public.bank_merchant_memory
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'employee'::app_role)
  );

DROP POLICY IF EXISTS "bank_merchant_memory_write" ON public.bank_merchant_memory;
CREATE POLICY "bank_merchant_memory_write" ON public.bank_merchant_memory
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  );

-- 1.4 bank_match_rules: AND/OR + txn_type + split blueprint
ALTER TABLE public.bank_match_rules
  ADD COLUMN IF NOT EXISTS logic_op text NOT NULL DEFAULT 'AND'
    CHECK (logic_op IN ('AND','OR')),
  ADD COLUMN IF NOT EXISTS txn_type text NOT NULL DEFAULT 'expense'
    CHECK (txn_type IN ('expense','receipt','transfer')),
  ADD COLUMN IF NOT EXISTS split_blueprint_json jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 1.6 Balance validation function (re-usable; also via RPC)
CREATE OR REPLACE FUNCTION public.validate_split_distribution(splits jsonb, total numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  total_abs numeric := abs(total);
  s_total numeric := 0;
  s_tax numeric := 0;
  s_actual numeric := 0;
  elem jsonb;
  amt numeric;
  tag text;
BEGIN
  IF splits IS NULL OR jsonb_array_length(splits) = 0 THEN
    RETURN 'EMPTY';
  END IF;
  FOR elem IN SELECT * FROM jsonb_array_elements(splits) LOOP
    amt := abs(COALESCE((elem->>'amount')::numeric, 0));
    tag := COALESCE(elem->>'book_tag', 'both');
    s_total := s_total + amt;
    IF tag IN ('both','tax_only') THEN s_tax := s_tax + amt; END IF;
    IF tag IN ('both','actual_only') THEN s_actual := s_actual + amt; END IF;
  END LOOP;
  IF round(s_total, 2) <> round(total_abs, 2) THEN
    RETURN 'TOTAL_MISMATCH:' || s_total::text || ':' || total_abs::text;
  END IF;
  IF round(s_tax, 2) <> round(total_abs, 2) THEN
    RETURN 'TAX_MISMATCH:' || s_tax::text || ':' || total_abs::text;
  END IF;
  IF round(s_actual, 2) <> round(total_abs, 2) THEN
    RETURN 'ACTUAL_MISMATCH:' || s_actual::text || ':' || total_abs::text;
  END IF;
  RETURN 'OK';
END;
$$;

-- Trigger: enforce balance on bank_feed_splits insert/update/delete
CREATE OR REPLACE FUNCTION public.enforce_split_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_line_id uuid;
  v_total numeric;
  v_splits jsonb;
  v_result text;
BEGIN
  v_line_id := COALESCE(NEW.line_id, OLD.line_id);
  SELECT abs(amount) INTO v_total FROM public.bank_feed_lines WHERE id = v_line_id;
  IF v_total IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('amount', amount, 'book_tag', book_tag)), '[]'::jsonb)
    INTO v_splits
    FROM public.bank_feed_splits
    WHERE line_id = v_line_id;

  IF v_splits = '[]'::jsonb THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_result := public.validate_split_distribution(v_splits, v_total);
  IF v_result <> 'OK' THEN
    RAISE EXCEPTION 'BANK_SPLIT_OUT_OF_BALANCE: %', v_result
      USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_split_balance ON public.bank_feed_splits;
CREATE CONSTRAINT TRIGGER trg_enforce_split_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_feed_splits
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_split_balance();

-- Trigger: remember merchant on post
CREATE OR REPLACE FUNCTION public.remember_merchant_on_post()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_firm uuid;
BEGIN
  IF NEW.status <> 'posted' THEN RETURN NEW; END IF;
  IF (TG_OP = 'UPDATE' AND OLD.status = 'posted') THEN RETURN NEW; END IF;
  IF NEW.category_account_id IS NULL AND NEW.vendor_id IS NULL THEN RETURN NEW; END IF;
  v_token := NEW.merchant_token;
  IF v_token IS NULL OR v_token = '' THEN RETURN NEW; END IF;

  SELECT firm_id INTO v_firm FROM public.bank_accounts WHERE id = NEW.account_id;

  INSERT INTO public.bank_merchant_memory
    (firm_id, merchant_token, description_sample, vendor_id, category_account_id, default_book_tag, hit_count, last_seen_at)
  VALUES
    (v_firm, v_token, NEW.description, NEW.vendor_id, NEW.category_account_id, NEW.book_tag, 1, now())
  ON CONFLICT (COALESCE(firm_id, '00000000-0000-0000-0000-000000000000'::uuid), merchant_token)
  DO UPDATE SET
    hit_count = public.bank_merchant_memory.hit_count + 1,
    last_seen_at = now(),
    description_sample = EXCLUDED.description_sample,
    vendor_id = COALESCE(EXCLUDED.vendor_id, public.bank_merchant_memory.vendor_id),
    category_account_id = COALESCE(EXCLUDED.category_account_id, public.bank_merchant_memory.category_account_id),
    default_book_tag = EXCLUDED.default_book_tag;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remember_merchant_on_post ON public.bank_feed_lines;
CREATE TRIGGER trg_remember_merchant_on_post
  AFTER INSERT OR UPDATE OF status, category_account_id, vendor_id
  ON public.bank_feed_lines
  FOR EACH ROW EXECUTE FUNCTION public.remember_merchant_on_post();
