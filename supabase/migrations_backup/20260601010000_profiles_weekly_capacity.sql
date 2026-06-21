-- Add weekly_capacity_hours to profiles for workload management.
-- Represents the number of billable hours a team member is expected to
-- log per calendar week. Defaults to 40 (full-time). Managed via the Workload Board.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_capacity_hours SMALLINT NOT NULL DEFAULT 40;

COMMENT ON COLUMN public.profiles.weekly_capacity_hours
  IS 'Target billable hours per week for capacity planning. Default 40. Set per-person via the Workload Board.';
