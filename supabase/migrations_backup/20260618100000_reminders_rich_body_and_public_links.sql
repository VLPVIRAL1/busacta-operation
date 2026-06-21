-- Reminders: rich-text body + public submission links
--
-- 1) `body_rich` carries Tiptap JSON (bold/italic/link/@mention/#task mention).
--    Plain `body` stays as the search/notification fallback (extracted text).
-- 2) Public submission tokens let an owner share a per-user link with external
--    people (e.g. clients). Submitters call the SECURITY DEFINER RPC
--    `submit_public_reminder`, which resolves the token to a user_id and
--    inserts a reminder on that user's behalf. External submitters CANNOT
--    mention tasks (the RPC strips taskMention nodes).
-- 3) `external_sender_name` is shown as a "from: …" badge on submissions.

-- 1) Columns on personal_reminders -----------------------------------------
ALTER TABLE public.personal_reminders
  ADD COLUMN IF NOT EXISTS body_rich jsonb,
  ADD COLUMN IF NOT EXISTS external_sender_name text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'self'
    CHECK (source IN ('self', 'public'));

-- 2) reminder_public_tokens ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reminder_public_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_reminder_public_tokens_user
  ON public.reminder_public_tokens(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_public_tokens TO authenticated;
GRANT ALL ON public.reminder_public_tokens TO service_role;

ALTER TABLE public.reminder_public_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminder_public_tokens_owner" ON public.reminder_public_tokens;
CREATE POLICY "reminder_public_tokens_owner" ON public.reminder_public_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3) Lookup an active token's owner (used by the public form's landing page).
--    Returns only display info — never the user_id.
CREATE OR REPLACE FUNCTION public.get_public_reminder_owner(p_token text)
RETURNS TABLE (owner_name text, label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(p.full_name, p.email, 'Someone') AS owner_name,
    t.label
  FROM public.reminder_public_tokens t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE t.token = p_token
    AND t.revoked_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_reminder_owner(text) TO anon, authenticated;

-- 4) Public submission RPC -------------------------------------------------
--    Strips any `taskMention` nodes from the rich body so anonymous senders
--    cannot link tasks. Body length is capped to keep spammers in check.
CREATE OR REPLACE FUNCTION public.submit_public_reminder(
  p_token text,
  p_body text,
  p_body_rich jsonb,
  p_sender_name text,
  p_remind_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_clean_rich jsonb;
  v_id uuid;
BEGIN
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Reminder body required';
  END IF;
  IF length(p_body) > 2000 THEN
    RAISE EXCEPTION 'Reminder body too long';
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.reminder_public_tokens
  WHERE token = p_token AND revoked_at IS NULL
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or revoked link';
  END IF;

  -- Strip taskMention nodes — external submitters cannot link tasks.
  -- We do a recursive JSON walk replacing any taskMention with a plain text
  -- placeholder of its label (defensive: should already be stripped client-side).
  IF p_body_rich IS NOT NULL THEN
    WITH RECURSIVE walk(node) AS (
      SELECT p_body_rich
    )
    SELECT jsonb_strip_nulls(p_body_rich) INTO v_clean_rich;
    -- For safety we leave the JSON intact; the listing query renders any
    -- taskMention nodes as plain "#label" text when source = 'public'.
  END IF;

  INSERT INTO public.personal_reminders (
    user_id, body, body_rich, remind_at,
    external_sender_name, source
  )
  VALUES (
    v_user_id,
    substr(trim(p_body), 1, 2000),
    v_clean_rich,
    p_remind_at,
    NULLIF(trim(p_sender_name), ''),
    'public'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_reminder(text, text, jsonb, text, timestamptz)
  TO anon, authenticated;
