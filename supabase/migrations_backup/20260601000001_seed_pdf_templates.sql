-- Seed sample PDF templates — 5 per doc_type (30 total)
-- created_by is resolved from the first super_admin user in user_roles

DO $$
DECLARE
  v_uid UUID;
BEGIN
  -- Resolve a valid user ID (prefer super_admin, fall back to any user)
  SELECT user_id INTO v_uid
  FROM user_roles
  WHERE role = 'super_admin'
  ORDER BY created_at
  LIMIT 1;

  IF v_uid IS NULL THEN
    SELECT id INTO v_uid FROM auth.users ORDER BY created_at LIMIT 1;
  END IF;

  IF v_uid IS NULL THEN
    RAISE NOTICE 'No users found — skipping PDF template seed. Re-run after first user signs up.';
    RETURN;
  END IF;

  -- ─── Invoice ──────────────────────────────────────────────────────────────

  INSERT INTO pdf_templates
    (name, description, doc_type, status, version, is_global, primary_color, secondary_color, font_family, created_by)
  VALUES
    (
      'Classic Professional Invoice',
      'A clean, traditional invoice layout with a prominent header, itemised table and totals block. Suitable for most B2B engagements.',
      'invoice', 'published', 1, TRUE, '#1e3a8a', '#c9a84c', 'Helvetica', v_uid
    ),
    (
      'Modern Minimal Invoice',
      'Stripped-back design with generous whitespace and an accent stripe. Ideal for boutique or design-forward firms.',
      'invoice', 'published', 1, TRUE, '#0f172a', '#6366f1', 'Inter', v_uid
    ),
    (
      'Detailed Tax Invoice',
      'Full GST/VAT-compliant invoice with GSTIN fields, HSN/SAC codes, tax breakdown and authorised signatory block.',
      'invoice', 'published', 1, TRUE, '#14532d', '#16a34a', 'Helvetica', v_uid
    ),
    (
      'Retainer Invoice',
      'Monthly retainer format with a single-line fee description, retainer period, and a concise totals section.',
      'invoice', 'draft', 1, TRUE, '#1e1b4b', '#7c3aed', 'Inter', v_uid
    ),
    (
      'International Invoice',
      'Multi-currency invoice with wire-transfer payment details, SWIFT/IBAN fields, and dual-language notes area.',
      'invoice', 'draft', 1, TRUE, '#0c4a6e', '#0ea5e9', 'Helvetica', v_uid
    );

  -- ─── Proforma ─────────────────────────────────────────────────────────────

  INSERT INTO pdf_templates
    (name, description, doc_type, status, version, is_global, primary_color, secondary_color, font_family, created_by)
  VALUES
    (
      'Standard Proforma',
      'Straightforward proforma invoice matching the Classic Invoice layout — identical fields, "PROFORMA" watermark.',
      'proforma', 'published', 1, TRUE, '#1e3a8a', '#c9a84c', 'Helvetica', v_uid
    ),
    (
      'Service Quote Proforma',
      'Scope-of-work focused proforma with a description column, estimated hours, day-rate, and validity date.',
      'proforma', 'published', 1, TRUE, '#7c2d12', '#ea580c', 'Inter', v_uid
    ),
    (
      'Advance Payment Proforma',
      'Used when requesting an advance. Shows percentage breakdown (advance vs. balance) and payment schedule.',
      'proforma', 'draft', 1, TRUE, '#0f172a', '#6366f1', 'Helvetica', v_uid
    ),
    (
      'Multi-Currency Proforma',
      'Dual-column layout showing amounts in local currency and USD/EUR. Includes exchange-rate disclosure note.',
      'proforma', 'draft', 1, TRUE, '#0c4a6e', '#0ea5e9', 'Inter', v_uid
    ),
    (
      'Quick Estimate Proforma',
      'Compact single-page estimate with condensed line-items and a prominent "Estimate valid for 15 days" notice.',
      'proforma', 'draft', 1, TRUE, '#14532d', '#16a34a', 'Helvetica', v_uid
    );

  -- ─── Salary Slip ──────────────────────────────────────────────────────────

  INSERT INTO pdf_templates
    (name, description, doc_type, status, version, is_global, primary_color, secondary_color, font_family, created_by)
  VALUES
    (
      'Standard Payslip',
      'Default salary slip with earnings/deductions table, net pay callout, PF/PT deductions and company seal area.',
      'salary_slip', 'published', 1, TRUE, '#1e3a8a', '#c9a84c', 'Helvetica', v_uid
    ),
    (
      'Executive Compensation Slip',
      'Enhanced payslip for senior staff — includes LTA, medical reimbursement, variable pay, and ESOP vesting notes.',
      'salary_slip', 'published', 1, TRUE, '#0f172a', '#6366f1', 'Inter', v_uid
    ),
    (
      'Contract Staff Payslip',
      'Simplified slip for contractors/consultants. Shows gross fee, TDS deduction, and net payout only.',
      'salary_slip', 'published', 1, TRUE, '#7c2d12', '#ea580c', 'Helvetica', v_uid
    ),
    (
      'Part-Time Staff Payslip',
      'Hour-based payslip with daily rate, days worked, overtime, and proportionate PF calculation.',
      'salary_slip', 'draft', 1, TRUE, '#14532d', '#16a34a', 'Inter', v_uid
    ),
    (
      'Annual CTC Breakdown Slip',
      'Year-end slip showing full CTC structure — fixed, variable, and reimbursements — alongside monthly figures.',
      'salary_slip', 'draft', 1, TRUE, '#1e1b4b', '#7c3aed', 'Helvetica', v_uid
    );

  -- ─── Financial Report ─────────────────────────────────────────────────────

  INSERT INTO pdf_templates
    (name, description, doc_type, status, version, is_global, primary_color, secondary_color, font_family, created_by)
  VALUES
    (
      'Profit & Loss Statement',
      'Standard P&L with revenue, operating expenses, EBITDA, depreciation, and net profit sections.',
      'financial_report', 'published', 1, TRUE, '#1e3a8a', '#c9a84c', 'Helvetica', v_uid
    ),
    (
      'Balance Sheet Template',
      'Horizontal-format balance sheet with assets (current/non-current) and liabilities (current/long-term) plus equity.',
      'financial_report', 'published', 1, TRUE, '#0f172a', '#6366f1', 'Inter', v_uid
    ),
    (
      'Cash Flow Statement',
      'Three-section cash flow — operating, investing, financing activities — with opening and closing cash balance.',
      'financial_report', 'published', 1, TRUE, '#0c4a6e', '#0ea5e9', 'Helvetica', v_uid
    ),
    (
      'Quarterly Review Report',
      'One-page management summary with KPIs, MoM comparison table, and commentary fields. Ideal for board packs.',
      'financial_report', 'draft', 1, TRUE, '#14532d', '#16a34a', 'Inter', v_uid
    ),
    (
      'Year-End Financial Summary',
      'Condensed annual report combining P&L highlights, balance sheet snapshot, and auditor notes block.',
      'financial_report', 'draft', 1, TRUE, '#7c2d12', '#ea580c', 'Helvetica', v_uid
    );

  -- ─── Bank Reconciliation ──────────────────────────────────────────────────

  INSERT INTO pdf_templates
    (name, description, doc_type, status, version, is_global, primary_color, secondary_color, font_family, created_by)
  VALUES
    (
      'Monthly Bank Recon',
      'Standard monthly reconciliation comparing bank statement balance to platform balance with variance line.',
      'bank_recon', 'published', 1, TRUE, '#1e3a8a', '#c9a84c', 'Helvetica', v_uid
    ),
    (
      'Current Account Recon',
      'Detailed recon for current accounts — lists outstanding cheques, deposits in transit, and adjusted balances.',
      'bank_recon', 'published', 1, TRUE, '#0f172a', '#6366f1', 'Inter', v_uid
    ),
    (
      'Multi-Account Bank Recon',
      'Side-by-side recon for up to three bank accounts on one page. Totals roll up to a combined variance.',
      'bank_recon', 'draft', 1, TRUE, '#0c4a6e', '#0ea5e9', 'Helvetica', v_uid
    ),
    (
      'Savings Account Recon',
      'Simplified recon for savings/interest-bearing accounts. Includes interest received and TDS deducted rows.',
      'bank_recon', 'draft', 1, TRUE, '#14532d', '#16a34a', 'Inter', v_uid
    ),
    (
      'Foreign Currency Bank Recon',
      'Recon for forex accounts with exchange-rate conversion, unrealised gain/loss, and functional-currency totals.',
      'bank_recon', 'draft', 1, TRUE, '#1e1b4b', '#7c3aed', 'Helvetica', v_uid
    );

  -- ─── Petty Cash Recon ─────────────────────────────────────────────────────

  INSERT INTO pdf_templates
    (name, description, doc_type, status, version, is_global, primary_color, secondary_color, font_family, created_by)
  VALUES
    (
      'Monthly Petty Cash Recon',
      'Opening balance, top-ups received, expenses cleared, and closing cash-on-hand with variance check.',
      'petty_cash_recon', 'published', 1, TRUE, '#1e3a8a', '#c9a84c', 'Helvetica', v_uid
    ),
    (
      'Department Petty Cash Summary',
      'Per-department breakdown of petty cash usage with category totals (stationery, travel, sundry).',
      'petty_cash_recon', 'published', 1, TRUE, '#7c2d12', '#ea580c', 'Inter', v_uid
    ),
    (
      'Travel & Expense Recon',
      'Expense-report style recon listing individual travel claims, approvals, receipts checked, and reimbursement balance.',
      'petty_cash_recon', 'published', 1, TRUE, '#0c4a6e', '#0ea5e9', 'Helvetica', v_uid
    ),
    (
      'Event Expense Recon',
      'Used after conferences or corporate events — lists all event spend lines against the approved budget.',
      'petty_cash_recon', 'draft', 1, TRUE, '#14532d', '#16a34a', 'Inter', v_uid
    ),
    (
      'Advance Settlement Recon',
      'Reconciles staff advance payments against submitted expense vouchers, showing outstanding or surplus amount.',
      'petty_cash_recon', 'draft', 1, TRUE, '#1e1b4b', '#7c3aed', 'Helvetica', v_uid
    );

END $$;
