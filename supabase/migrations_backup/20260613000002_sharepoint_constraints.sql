-- Adds missing unique constraints and the storage_path column needed for migration.

-- 1. task_folder_nodes: unique (task_id, sp_item_id) for idempotent upsert in handlers.server.ts
ALTER TABLE public.task_folder_nodes
  ADD CONSTRAINT uq_task_folder_nodes_task_sp UNIQUE (task_id, sp_item_id);

-- 2. documents: storage_path for the Supabase Storage → SharePoint migration script
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storage_path text;
