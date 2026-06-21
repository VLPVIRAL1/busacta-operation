-- Align task_action_items.kind CHECK constraint with the app taxonomy.
-- The TS taxonomy in src/lib/ops/action-item-kinds.ts adds "information_required"
-- and "confirm" on top of the original four values, but the DB CHECK was never
-- updated — so adding clarifications from a template that uses either of the new
-- kinds fails with: violates check constraint "task_action_items_kind_chk".

ALTER TABLE public.task_action_items
  DROP CONSTRAINT IF EXISTS task_action_items_kind_chk;

ALTER TABLE public.task_action_items
  ADD CONSTRAINT task_action_items_kind_chk
  CHECK (
    kind = ANY (
      ARRAY[
        'open_point'::text,
        'clarification'::text,
        'document_needed'::text,
        'information_required'::text,
        'confirm'::text,
        'other'::text
      ]
    )
  );
