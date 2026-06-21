ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS esign_sender_name text,
  ADD COLUMN IF NOT EXISTS esign_reply_to text;