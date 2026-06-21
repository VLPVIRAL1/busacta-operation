-- Add is_archived flag to clients table
-- Archived clients are hidden from the main list but preserved for audit purposes

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false NOT NULL;

-- Index for the common filtered query (firm + not archived)
CREATE INDEX IF NOT EXISTS idx_clients_firm_not_archived
  ON clients (firm_id, is_archived)
  WHERE is_archived = false;
