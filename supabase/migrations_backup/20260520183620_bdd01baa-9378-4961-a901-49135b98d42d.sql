ALTER TABLE public.esign_recipients
  ALTER COLUMN signing_ip TYPE TEXT USING signing_ip::text;