-- 1. Book tag enum
DO $$ BEGIN
  CREATE TYPE public.book_tag AS ENUM ('both', 'tax_only', 'actual_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add book_tag to journal_lines (default 'both' preserves all existing data)
ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS book_tag public.book_tag NOT NULL DEFAULT 'both';

CREATE INDEX IF NOT EXISTS idx_jl_book_tag ON public.journal_lines(book_tag);

-- 3. Add total_transaction_amount to journal_entries (the cash/bank leg)
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS total_transaction_amount numeric(14,2);

-- 4. Replace per-entry balance check with per-book balance check.
--    Each book (Tax book = both + tax_only, Actual book = both + actual_only)
--    must independently have debit = credit.
CREATE OR REPLACE FUNCTION public.enforce_journal_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tax_d numeric; tax_c numeric;
  act_d numeric; act_c numeric;
BEGIN
  IF NEW.posted_at IS NOT NULL AND (OLD.posted_at IS NULL OR OLD.posted_at IS DISTINCT FROM NEW.posted_at) THEN
    SELECT
      COALESCE(SUM(CASE WHEN book_tag IN ('both','tax_only')    THEN debit  ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN book_tag IN ('both','tax_only')    THEN credit ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN book_tag IN ('both','actual_only') THEN debit  ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN book_tag IN ('both','actual_only') THEN credit ELSE 0 END), 0)
    INTO tax_d, tax_c, act_d, act_c
    FROM public.journal_lines
    WHERE entry_id = NEW.id;

    IF tax_d <> tax_c OR tax_d = 0 THEN
      RAISE EXCEPTION 'Journal entry % Tax book is unbalanced (debit % vs credit %)',
        NEW.entry_no, tax_d, tax_c;
    END IF;
    IF act_d <> act_c OR act_d = 0 THEN
      RAISE EXCEPTION 'Journal entry % Actual book is unbalanced (debit % vs credit %)',
        NEW.entry_no, act_d, act_c;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;