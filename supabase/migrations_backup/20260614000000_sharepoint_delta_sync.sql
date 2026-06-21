-- SharePoint two-way sync: delta token storage + documents unique constraint.
-- The delta token enables incremental change detection via the Graph API delta endpoint.
-- sharepoint_last_synced_at gates the cron worker from re-enqueueing too aggressively.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sharepoint_delta_token    text,
  ADD COLUMN IF NOT EXISTS sharepoint_last_synced_at timestamptz;

-- Required for idempotent upsert in handleDeltaSyncDrive (documents.sharepoint_item_id must be unique).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_documents_sharepoint_item_id'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT uq_documents_sharepoint_item_id UNIQUE (sharepoint_item_id);
  END IF;
END $$;
