-- Manual ordering for the To-Do list. Tasks are drag-reorderable within each
-- Firm/Project group; sort_order holds the user-defined position. NULL means
-- "unordered" and falls back to the due-date/created-at sort.
alter table public.tasks
  add column if not exists sort_order integer;

comment on column public.tasks.sort_order is
  'User-defined position within the To-Do list Firm/Project group. NULL = unordered (falls back to due_date, created_at).';
