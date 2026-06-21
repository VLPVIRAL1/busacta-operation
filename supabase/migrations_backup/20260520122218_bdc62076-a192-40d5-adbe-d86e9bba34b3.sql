ALTER TABLE public.esign_completed_documents
  ADD COLUMN IF NOT EXISTS bytes_hashed BIGINT,
  ADD COLUMN IF NOT EXISTS id_appendix_included BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signer_count INT,
  ADD COLUMN IF NOT EXISTS audit_event_count INT;