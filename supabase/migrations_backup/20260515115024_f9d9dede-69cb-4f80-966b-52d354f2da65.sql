-- Remove orphan rows so the FKs can be created
DELETE FROM public.task_assignees ta
 WHERE NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = ta.task_id);

DELETE FROM public.task_assignees ta
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ta.user_id);

-- Add the missing foreign keys so PostgREST can embed task_assignees → tasks → profiles
ALTER TABLE public.task_assignees
  ADD CONSTRAINT task_assignees_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE public.task_assignees
  ADD CONSTRAINT task_assignees_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;