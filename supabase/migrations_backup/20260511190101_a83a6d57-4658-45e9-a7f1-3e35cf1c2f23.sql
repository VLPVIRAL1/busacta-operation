-- OTP backup channels for sign-in (alternative to TOTP authenticator)
CREATE TABLE IF NOT EXISTS public.user_otp_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  destination TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel)
);

ALTER TABLE public.user_otp_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own otp channels"
  ON public.user_otp_channels FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users insert own otp channels"
  ON public.user_otp_channels FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own otp channels"
  ON public.user_otp_channels FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own otp channels"
  ON public.user_otp_channels FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_otp_channels_updated_at
  BEFORE UPDATE ON public.user_otp_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- One-time codes (hashed). Used both for enrollment verification and login challenges.
CREATE TABLE IF NOT EXISTS public.otp_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  destination TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('login','enrollment')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_user_recent
  ON public.otp_challenges (user_id, channel, created_at DESC);

ALTER TABLE public.otp_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own otp challenges"
  ON public.otp_challenges FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users insert own otp challenges"
  ON public.otp_challenges FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own otp challenges"
  ON public.otp_challenges FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);