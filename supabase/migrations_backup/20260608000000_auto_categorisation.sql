-- Auto-Categorisation Engine: tables, columns, indexes, RLS, and seed data.
-- Enables automatic document type detection for uploaded files.

---------------------------------------------------------------------
-- 1. New columns on task_attachments
---------------------------------------------------------------------
alter table task_attachments
  add column if not exists categorisation_status     text         default null,
  add column if not exists doc_type                  varchar(50)  default null,
  add column if not exists mapped_category           varchar(100) default null,
  add column if not exists confidence_score          smallint     default null,
  add column if not exists detection_method          varchar(20)  default null,
  add column if not exists categorisation_started_at timestamptz  default null;

create index if not exists idx_attachments_cat_status
  on task_attachments (categorisation_status)
  where categorisation_status is not null;

---------------------------------------------------------------------
-- 2. categorisation_config — one row per document type
---------------------------------------------------------------------
create table if not exists categorisation_config (
  id                   uuid primary key default gen_random_uuid(),
  doc_type             varchar(50)  not null unique,
  display_name         varchar(100) not null,
  mapped_category      varchar(100) not null,
  country_code         varchar(3)   not null default 'IN',
  min_confidence       smallint     not null default 75
                         check (min_confidence between 0 and 100),
  allow_multi_segment  boolean      not null default false,
  auto_post_ledger     boolean      not null default false,
  highlight_color      varchar(7)   not null default '#378ADD',
  is_active            boolean      not null default true,
  sort_order           smallint     not null default 0,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now()
);

create index if not exists idx_cat_config_active
  on categorisation_config (is_active) where is_active = true;

alter table categorisation_config enable row level security;

create policy "cat_config_read" on categorisation_config
  for select using (auth.role() = 'authenticated');

create policy "cat_config_write" on categorisation_config
  for all using (
    current_user_role() in ('super_admin', 'admin')
  );

---------------------------------------------------------------------
-- 3. categorisation_rules — detection signals per doc type
---------------------------------------------------------------------
create table if not exists categorisation_rules (
  id               uuid primary key default gen_random_uuid(),
  doc_type         varchar(50)  not null,
  signal_text      text         not null,
  signal_type      varchar(20)  not null
                     check (signal_type in ('filename', 'form-code', 'keyword', 'regex')),
  signal_source    varchar(20)  not null default 'ocr'
                     check (signal_source in ('filename', 'ocr')),
  weight           smallint     not null default 70
                     check (weight between 0 and 100),
  is_active        boolean      not null default true,
  priority         smallint     not null default 0,
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);

create index if not exists idx_cat_rules_doc_type on categorisation_rules (doc_type);
create index if not exists idx_cat_rules_active   on categorisation_rules (is_active) where is_active = true;

alter table categorisation_rules enable row level security;

create policy "cat_rules_read" on categorisation_rules
  for select using (auth.role() = 'authenticated');

create policy "cat_rules_write" on categorisation_rules
  for all using (
    current_user_role() in ('super_admin', 'admin')
  );

---------------------------------------------------------------------
-- 4. doc_categorisation_results — outcome per segment per document
---------------------------------------------------------------------
create table if not exists doc_categorisation_results (
  id                  uuid primary key default gen_random_uuid(),
  task_attachment_id  uuid         not null references task_attachments(id) on delete cascade,
  segment_index       smallint     not null default 0,
  segment_pages       text,
  doc_type            varchar(50),
  mapped_category     varchar(100),
  confidence_score    smallint     not null default 0
                        check (confidence_score between 0 and 100),
  detection_method    varchar(20)  not null,
  signals_matched     text,
  runner_up_type      varchar(50),
  runner_up_score     smallint,
  status              varchar(20)  not null default 'auto'
                        check (status in ('auto', 'confirmed', 'overridden', 'needs_review')),
  confirmed_by        uuid,
  confirmed_at        timestamptz,
  created_at          timestamptz  not null default now()
);

create index if not exists idx_cat_results_attachment on doc_categorisation_results (task_attachment_id);
create index if not exists idx_cat_results_status     on doc_categorisation_results (status);

alter table doc_categorisation_results enable row level security;

create policy "cat_results_read" on doc_categorisation_results
  for select using (auth.role() = 'authenticated');

-- Writes happen via service role (Edge Function) — no user-facing write policy needed.
-- Confirm/override goes through server functions using the admin client.

---------------------------------------------------------------------
-- 5. Seed data: categorisation_config
---------------------------------------------------------------------
insert into categorisation_config
  (doc_type, display_name, mapped_category, country_code, min_confidence, allow_multi_segment, highlight_color, sort_order)
values
  ('W2',           'Form W-2 (US salary)',          'Salary income',         'US', 75, true,  '#185FA5', 1),
  ('1099_MISC',    'Form 1099-MISC (US freelance)', 'Freelance income',      'US', 70, true,  '#0F6E56', 2),
  ('1099_INT',     'Form 1099-INT (US interest)',    'Interest income',       'US', 70, true,  '#854F0B', 3),
  ('1099_DIV',     'Form 1099-DIV (US dividends)',   'Dividend income',       'US', 70, true,  '#534AB7', 4),
  ('GST_INVOICE',  'GST Tax Invoice (India)',        'Purchase / expense',    'IN', 72, true,  '#534AB7', 5),
  ('FORM_16',      'Form 16 / TDS Certificate',     'TDS — salary',          'IN', 75, false, '#993C1D', 6),
  ('FORM_26AS',    'Form 26AS (Tax credit)',         'Tax credit statement',  'IN', 78, false, '#3B6D11', 7),
  ('BANK_STMT',    'Bank statement',                 'Bank reconciliation',   'ALL',65, false, '#888780', 8),
  ('PAN_CARD',     'PAN card',                       'Identity document',     'IN', 85, false, '#D85A30', 9),
  ('ITR',          'Income Tax Return (ITR)',        'Tax filing',            'IN', 78, false, '#1D9E75', 10)
on conflict (doc_type) do nothing;

---------------------------------------------------------------------
-- 6. Seed data: categorisation_rules
---------------------------------------------------------------------

-- W-2 signals
insert into categorisation_rules (doc_type, signal_text, signal_type, signal_source, weight) values
  ('W2', 'w2, w-2, wage and tax statement',  'filename',  'filename', 90),
  ('W2', 'Form W-2, Form W2',                'form-code', 'ocr',      97),
  ('W2', 'wages tips other compensation',     'keyword',   'ocr',      82),
  ('W2', 'employer identification number',    'keyword',   'ocr',      78),
  ('W2', 'federal income tax withheld',       'keyword',   'ocr',      75),
  ('W2', 'social security wages',             'keyword',   'ocr',      72),
  ('W2', 'medicare tax withheld',             'keyword',   'ocr',      70);

-- 1099-MISC signals
insert into categorisation_rules (doc_type, signal_text, signal_type, signal_source, weight) values
  ('1099_MISC', '1099, 1099-misc, misc',       'filename',  'filename', 88),
  ('1099_MISC', 'Form 1099-MISC',              'form-code', 'ocr',      97),
  ('1099_MISC', 'nonemployee compensation',     'keyword',   'ocr',      92),
  ('1099_MISC', 'miscellaneous information',    'keyword',   'ocr',      70),
  ('1099_MISC', 'payer tin',                    'keyword',   'ocr',      65);

-- 1099-INT signals
insert into categorisation_rules (doc_type, signal_text, signal_type, signal_source, weight) values
  ('1099_INT', '1099-int, interest',        'filename',  'filename', 88),
  ('1099_INT', 'Form 1099-INT',             'form-code', 'ocr',      97),
  ('1099_INT', 'interest income',           'keyword',   'ocr',      88),
  ('1099_INT', 'early withdrawal penalty',  'keyword',   'ocr',      72);

-- GST Invoice signals
insert into categorisation_rules (doc_type, signal_text, signal_type, signal_source, weight) values
  ('GST_INVOICE', 'gst, invoice, tax invoice, gstin',  'filename',  'filename', 82),
  ('GST_INVOICE', 'regex:\bGSTIN\b',                   'regex',     'ocr',      95),
  ('GST_INVOICE', 'CGST, SGST, IGST',                  'keyword',   'ocr',      90),
  ('GST_INVOICE', 'HSN code, SAC code',                'keyword',   'ocr',      78),
  ('GST_INVOICE', 'place of supply',                   'keyword',   'ocr',      72),
  ('GST_INVOICE', 'taxable value',                     'keyword',   'ocr',      68);

-- Form 16 / TDS Certificate signals
insert into categorisation_rules (doc_type, signal_text, signal_type, signal_source, weight) values
  ('FORM_16', 'form16, form-16, tds, tds-cert',  'filename',  'filename', 88),
  ('FORM_16', 'Form No. 16, Form 16',            'form-code', 'ocr',      97),
  ('FORM_16', 'regex:\bTAN\b',                   'regex',     'ocr',      90),
  ('FORM_16', 'TDS deducted, tax deducted',      'keyword',   'ocr',      85),
  ('FORM_16', 'PAN of deductee',                 'keyword',   'ocr',      82),
  ('FORM_16', 'assessment year',                 'keyword',   'ocr',      68);

-- Form 26AS signals
insert into categorisation_rules (doc_type, signal_text, signal_type, signal_source, weight) values
  ('FORM_26AS', '26as, form26as',                      'filename',  'filename', 88),
  ('FORM_26AS', 'Form 26AS, Annual Tax Statement',     'form-code', 'ocr',      97),
  ('FORM_26AS', 'tax credit statement',                'keyword',   'ocr',      88),
  ('FORM_26AS', 'Part A, Part B, Part C',              'keyword',   'ocr',      60);

-- Bank statement signals
insert into categorisation_rules (doc_type, signal_text, signal_type, signal_source, weight) values
  ('BANK_STMT', 'statement, bank-statement, account-statement',  'filename',  'filename', 78),
  ('BANK_STMT', 'account statement, bank statement',             'form-code', 'ocr',      88),
  ('BANK_STMT', 'opening balance, closing balance',              'keyword',   'ocr',      85),
  ('BANK_STMT', 'debit, credit, transaction date',               'keyword',   'ocr',      65),
  ('BANK_STMT', 'HDFC, SBI, ICICI, Axis, Kotak',                'keyword',   'ocr',      55);

-- PAN Card signals
insert into categorisation_rules (doc_type, signal_text, signal_type, signal_source, weight) values
  ('PAN_CARD', 'pan, pan-card, pancard',                   'filename',  'filename', 85),
  ('PAN_CARD', 'INCOME TAX DEPARTMENT, Permanent Account', 'form-code', 'ocr',      95),
  ('PAN_CARD', 'regex:\b[A-Z]{5}[0-9]{4}[A-Z]\b',        'regex',     'ocr',      88);

-- ITR signals
insert into categorisation_rules (doc_type, signal_text, signal_type, signal_source, weight) values
  ('ITR', 'itr, income-tax-return, itr-v',                      'filename',  'filename', 85),
  ('ITR', 'INDIAN INCOME TAX RETURN, ITR-V, ITR Acknowledgement', 'form-code', 'ocr',   97),
  ('ITR', 'total income, tax payable, verification',              'keyword',   'ocr',    75),
  ('ITR', 'assessment year, return filed',                        'keyword',   'ocr',    70);
