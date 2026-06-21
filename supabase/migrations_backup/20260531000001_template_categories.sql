-- Expand the Ops template system into three categories:
--   'workflow'      — existing engagement checklists (inject into task sub-tasks)
--   'clarification' — Clarification & Action Item templates (generate task_action_items)
--   'email'         — Email templates (subject + rich-text body + {{placeholders}})
--
-- All three categories live in workflow_templates so the split-pane authoring UI,
-- queries and RLS policies are shared (DRY). Clarification templates reuse
-- template_checklist_items, gaining a per-item `kind` that maps to the
-- task_action_items.kind taxonomy. Email templates carry subject/body columns.

ALTER TABLE workflow_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'workflow',
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_body text;

-- NOT VALID: skip validating pre-existing rows (they default to 'workflow' anyway),
-- but enforce the allowed set for all future inserts/updates.
ALTER TABLE workflow_templates
  DROP CONSTRAINT IF EXISTS workflow_templates_category_chk;
ALTER TABLE workflow_templates
  ADD CONSTRAINT workflow_templates_category_chk
  CHECK (category IN ('workflow', 'clarification', 'email')) NOT VALID;

-- Per-item action-item kind for clarification templates. Null for workflow items.
-- Mirrors task_action_items.kind (open_point/clarification/document_needed/
-- information_required/confirm/other) but stored as free text like that column.
ALTER TABLE template_checklist_items
  ADD COLUMN IF NOT EXISTS kind text;
