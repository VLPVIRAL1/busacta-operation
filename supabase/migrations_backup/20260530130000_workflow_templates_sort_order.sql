-- Add sort_order to workflow_templates for drag-and-drop reordering
ALTER TABLE workflow_templates
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Seed sort_order based on current alphabetical name order
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY name) - 1) * 10 AS new_order
  FROM workflow_templates
)
UPDATE workflow_templates
SET sort_order = ranked.new_order
FROM ranked
WHERE workflow_templates.id = ranked.id;
