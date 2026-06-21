ALTER TABLE public.chat_threads ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.chat_thread_members ALTER COLUMN user_id SET DEFAULT auth.uid();