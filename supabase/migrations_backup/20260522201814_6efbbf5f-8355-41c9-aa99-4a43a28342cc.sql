
-- 1. Update bank_match_rules.txn_type values + check constraint
ALTER TABLE public.bank_match_rules DROP CONSTRAINT IF EXISTS bank_match_rules_txn_type_check;

UPDATE public.bank_match_rules SET txn_type = 'income'  WHERE txn_type = 'receipt';
UPDATE public.bank_match_rules SET txn_type = 'journal' WHERE txn_type = 'transfer';

ALTER TABLE public.bank_match_rules
  ADD CONSTRAINT bank_match_rules_txn_type_check
  CHECK (txn_type = ANY (ARRAY['expense'::text, 'income'::text, 'journal'::text, 'payroll'::text]));

-- 2. Add txn_type to bank_feed_lines (nullable; client auto-derives from amount when null)
ALTER TABLE public.bank_feed_lines
  ADD COLUMN IF NOT EXISTS txn_type text;

ALTER TABLE public.bank_feed_lines DROP CONSTRAINT IF EXISTS bank_feed_lines_txn_type_check;
ALTER TABLE public.bank_feed_lines
  ADD CONSTRAINT bank_feed_lines_txn_type_check
  CHECK (txn_type IS NULL OR txn_type = ANY (ARRAY['expense'::text, 'income'::text, 'journal'::text, 'payroll'::text]));
