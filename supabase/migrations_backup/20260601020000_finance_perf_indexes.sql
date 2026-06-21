-- Performance indexes for Finance Module queries identified during code audit.

-- AR aging reports: invoices filtered/sorted by status + due_date
CREATE INDEX IF NOT EXISTS idx_invoices_status_due
  ON invoices (status, due_date);

-- General ledger queries: journal_lines filtered by account and date window
CREATE INDEX IF NOT EXISTS idx_jl_account_date
  ON journal_lines (account_id, created_at);

-- COA page: accounts sorted by type then creation time
CREATE INDEX IF NOT EXISTS idx_coa_type_created
  ON chart_of_accounts (account_type, created_at);
