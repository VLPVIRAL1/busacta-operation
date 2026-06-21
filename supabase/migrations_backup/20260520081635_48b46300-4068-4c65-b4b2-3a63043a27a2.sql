
-- 1. Revoke every still-pending invitation so the Admin "New invitation" flow is closed for good.
UPDATE public.invitations
SET accepted_at = now()
WHERE accepted_at IS NULL;

-- 2. Sub-roles scaffolding
CREATE TABLE IF NOT EXISTS public.role_subroles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_role public.app_role NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (base_role, name)
);

CREATE TABLE IF NOT EXISTS public.role_subrole_capabilities (
  subrole_id uuid NOT NULL REFERENCES public.role_subroles(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  allowed boolean NOT NULL,
  PRIMARY KEY (subrole_id, module_key)
);

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS subrole_id uuid REFERENCES public.role_subroles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_subrole_id ON public.user_roles(subrole_id);

-- 3. RLS
ALTER TABLE public.role_subroles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_subrole_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read subroles" ON public.role_subroles;
CREATE POLICY "Authenticated can read subroles"
ON public.role_subroles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins manage subroles" ON public.role_subroles;
CREATE POLICY "Admins manage subroles"
ON public.role_subroles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated can read subrole caps" ON public.role_subrole_capabilities;
CREATE POLICY "Authenticated can read subrole caps"
ON public.role_subrole_capabilities FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins manage subrole caps" ON public.role_subrole_capabilities;
CREATE POLICY "Admins manage subrole caps"
ON public.role_subrole_capabilities FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 4. updated_at trigger for subroles
DROP TRIGGER IF EXISTS trg_role_subroles_updated_at ON public.role_subroles;
CREATE TRIGGER trg_role_subroles_updated_at
BEFORE UPDATE ON public.role_subroles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
