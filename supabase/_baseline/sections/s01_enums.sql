-- Enum types (72)
CREATE TYPE public.app_role AS ENUM (
  'admin',
  'employee',
  'client',
  'super_admin',
  'finance_manager',
  'hr_manager'
);
CREATE TYPE public.asset_category AS ENUM (
  'laptop',
  'desktop',
  'monitor',
  'phone',
  'tablet',
  'peripheral',
  'furniture',
  'software_license',
  'other'
);
CREATE TYPE public.asset_status AS ENUM (
  'in_stock',
  'assigned',
  'in_repair',
  'retired',
  'lost'
);
CREATE TYPE public.attendance_status AS ENUM (
  'present',
  'absent',
  'late',
  'half_day',
  'remote',
  'holiday'
);
CREATE TYPE public.bank_feed_status AS ENUM (
  'pending',
  'posted',
  'excluded'
);
CREATE TYPE public.billable_event_source AS ENUM (
  'stage_completion',
  'time_log',
  'fixed_person_cadence',
  'tbd_manual'
);
CREATE TYPE public.billable_event_status AS ENUM (
  'ready',
  'deferred',
  'invoiced',
  'recalled',
  'superseded'
);
CREATE TYPE public.book_tag AS ENUM (
  'both',
  'tax_only',
  'actual_only'
);
CREATE TYPE public.budget_journal_status AS ENUM (
  'draft',
  'posted',
  'archived'
);
CREATE TYPE public.budget_line_entity_type AS ENUM (
  'customer',
  'employee',
  'vendor',
  'none'
);
CREATE TYPE public.budget_line_sub_type AS ENUM (
  'client_revenue',
  'payroll',
  'expense'
);
CREATE TYPE public.budget_reporting_book AS ENUM (
  'both',
  'tax_only',
  'actual_only'
);
CREATE TYPE public.campaign_channel AS ENUM (
  'email',
  'social',
  'events',
  'content',
  'referral',
  'paid',
  'seo',
  'other'
);
CREATE TYPE public.campaign_status AS ENUM (
  'planned',
  'in_progress',
  'live',
  'done',
  'cancelled'
);
CREATE TYPE public.coa_account_type AS ENUM (
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
  'petty_cash',
  'cash_bank',
  'payroll'
);
CREATE TYPE public.contract_doc_format AS ENUM (
  'docx',
  'pdf'
);
CREATE TYPE public.contract_template_status AS ENUM (
  'draft',
  'published',
  'archived'
);
CREATE TYPE public.contract_type AS ENUM (
  'nda',
  'sla',
  'other'
);
CREATE TYPE public.direct_client_type AS ENUM (
  'individual',
  'business'
);
CREATE TYPE public.entity_type AS ENUM (
  'individual',
  'business'
);
CREATE TYPE public.esign_auth_method AS ENUM (
  'email_link',
  'sms_otp',
  'access_code'
);
CREATE TYPE public.esign_envelope_status AS ENUM (
  'draft',
  'sent',
  'in_progress',
  'completed',
  'declined',
  'voided',
  'expired'
);
CREATE TYPE public.esign_event AS ENUM (
  'envelope_created',
  'envelope_sent',
  'envelope_voided',
  'envelope_expired',
  'envelope_completed',
  'recipient_notified',
  'recipient_reminded',
  'auth_challenged',
  'auth_passed',
  'auth_failed',
  'consent_accepted',
  'document_viewed',
  'field_filled',
  'signature_applied',
  'recipient_completed',
  'recipient_declined',
  'certificate_generated',
  'verification_scanned',
  'reminder_sent',
  'project_updated'
);
CREATE TYPE public.esign_field_type AS ENUM (
  'signature',
  'initials',
  'text',
  'checkbox',
  'radio',
  'date_signed',
  'name',
  'email',
  'company',
  'title',
  'attachment',
  'signer_id_document'
);
CREATE TYPE public.esign_recipient_role AS ENUM (
  'signer',
  'approver',
  'viewer',
  'cc'
);
CREATE TYPE public.esign_recipient_status AS ENUM (
  'pending',
  'notified',
  'viewed',
  'consented',
  'authenticated',
  'completed',
  'declined'
);
CREATE TYPE public.esign_routing_mode AS ENUM (
  'parallel',
  'sequential'
);
CREATE TYPE public.esign_target_kind AS ENUM (
  'direct_client',
  'cpa',
  'hr'
);
CREATE TYPE public.invoice_line_source AS ENUM (
  'time_log',
  'task',
  'manual',
  'billable_event',
  'fixed_person_retainer',
  'tbd_manual'
);
CREATE TYPE public.invoice_status AS ENUM (
  'draft',
  'sent',
  'partial',
  'paid',
  'void'
);
CREATE TYPE public.invoice_type AS ENUM (
  'invoice',
  'proforma'
);
CREATE TYPE public.journal_source AS ENUM (
  'manual',
  'invoice',
  'payment',
  'petty_cash',
  'receipt',
  'payroll',
  'bank'
);
CREATE TYPE public.key_status AS ENUM (
  'available',
  'checked_out',
  'lost',
  'retired'
);
CREATE TYPE public.key_type AS ENUM (
  'key',
  'card',
  'fob',
  'code'
);
CREATE TYPE public.lead_activity_type AS ENUM (
  'note',
  'call',
  'email',
  'meeting',
  'proposal',
  'other'
);
CREATE TYPE public.lead_source AS ENUM (
  'referral',
  'website',
  'cold_outreach',
  'event',
  'partner',
  'other'
);
CREATE TYPE public.lead_stage AS ENUM (
  'new',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost'
);
CREATE TYPE public.leave_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);
CREATE TYPE public.leave_type AS ENUM (
  'vacation',
  'sick',
  'personal',
  'unpaid',
  'bereavement',
  'other'
);
CREATE TYPE public.link_type AS ENUM (
  'knowledge_hub',
  'sharepoint',
  'client_portal',
  'other'
);
CREATE TYPE public.marketing_asset_type AS ENUM (
  'case_study',
  'collateral',
  'blog_post',
  'template',
  'image',
  'video',
  'link',
  'other'
);
CREATE TYPE public.message_scope AS ENUM (
  'firm',
  'task'
);
CREATE TYPE public.organizer_block_type AS ENUM (
  'section',
  'subsection',
  'info',
  'short_text',
  'long_text',
  'number',
  'currency',
  'yes_no',
  'single_choice',
  'multi_choice',
  'date',
  'date_range',
  'file_upload',
  'signature',
  'address',
  'table',
  'divider',
  'attachment_request',
  'rating',
  'matrix',
  'rich_text',
  'multi_file',
  'calculated'
);
CREATE TYPE public.organizer_deployment_status AS ENUM (
  'not_started',
  'in_progress',
  'submitted',
  'under_review',
  'graded',
  'returned',
  'cancelled'
);
CREATE TYPE public.organizer_display_mode AS ENUM (
  'card',
  'page'
);
CREATE TYPE public.organizer_purpose AS ENUM (
  'tax',
  'hr_exam',
  'onboarding',
  'learning_quiz',
  'generic'
);
CREATE TYPE public.organizer_review_action AS ENUM (
  'graded',
  'returned',
  'reopened',
  'note_updated',
  'score_overridden'
);
CREATE TYPE public.organizer_target_type AS ENUM (
  'client_entity',
  'profile',
  'task',
  'project',
  'course',
  'firm',
  'direct_client'
);
CREATE TYPE public.organizer_template_status AS ENUM (
  'draft',
  'published',
  'archived'
);
CREATE TYPE public.payroll_run_status AS ENUM (
  'draft',
  'processing',
  'approved',
  'paid',
  'cancelled'
);
CREATE TYPE public.pdf_doc_type AS ENUM (
  'invoice',
  'proforma',
  'salary_slip',
  'financial_report',
  'bank_recon',
  'petty_cash_recon'
);
CREATE TYPE public.pdf_field_type AS ENUM (
  'section',
  'logo',
  'static_text',
  'placeholder',
  'divider',
  'spacer',
  'line_items_table',
  'totals_block',
  'earnings_deductions_table',
  'report_table',
  'signature_block',
  'payment_details',
  'notes_block'
);
CREATE TYPE public.pdf_template_status AS ENUM (
  'draft',
  'published',
  'archived'
);
CREATE TYPE public.petty_cash_direction AS ENUM (
  'in',
  'out'
);
CREATE TYPE public.petty_cash_entry_type AS ENUM (
  'issuance',
  'top_up',
  'refund',
  'adjustment'
);
CREATE TYPE public.petty_cash_recon_status AS ENUM (
  'draft',
  'submitted',
  'approved',
  'rejected'
);
CREATE TYPE public.pipeline_stage AS ENUM (
  'handover_received',
  'in_prep',
  'internal_qc',
  'waiting_cpa',
  'ready_for_delivery',
  'final_signoff'
);
CREATE TYPE public.position_type AS ENUM (
  'partner',
  'manager',
  'senior',
  'staff',
  'reviewer',
  'preparer',
  'client_contact',
  'other'
);
CREATE TYPE public.pricing_model_kind AS ENUM (
  'pay_per_task',
  'effective_hours',
  'fixed_person',
  'tbd'
);
CREATE TYPE public.project_type AS ENUM (
  'accounting',
  'tax_preparation',
  'sales_tax',
  'company_formation',
  'payroll_processing',
  'other',
  'auditing'
);
CREATE TYPE public.software_type AS ENUM (
  'lacerte',
  'drake',
  'cch_axcess',
  'ultratax',
  'proconnect',
  'other'
);
CREATE TYPE public.subtask_status AS ENUM (
  'todo',
  'in_progress',
  'done'
);
CREATE TYPE public.task_complexity AS ENUM (
  'a_hard',
  'b_medium',
  'c_easy'
);
CREATE TYPE public.task_priority AS ENUM (
  'low',
  'medium',
  'high'
);
CREATE TYPE public.task_status AS ENUM (
  'draft',
  'in_progress',
  'review',
  'waiting_client',
  'complete'
);
CREATE TYPE public.tax_software AS ENUM (
  'lacerte',
  'drake',
  'cch_axcess',
  'ultratax',
  'proconnect',
  'other'
);
CREATE TYPE public.template_type AS ENUM (
  'form_1065',
  'form_1120s',
  'form_1120',
  'form_1040',
  'none'
);
CREATE TYPE public.ticket_category AS ENUM (
  'it_support',
  'facilities',
  'hr',
  'suggestion',
  'other'
);
CREATE TYPE public.ticket_priority AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);
CREATE TYPE public.ticket_status AS ENUM (
  'open',
  'in_progress',
  'resolved',
  'closed'
);
CREATE TYPE public.training_category AS ENUM (
  'compliance',
  'technical',
  'soft_skills',
  'onboarding',
  'other'
);
CREATE TYPE public.training_status AS ENUM (
  'assigned',
  'in_progress',
  'completed',
  'overdue',
  'waived'
);
