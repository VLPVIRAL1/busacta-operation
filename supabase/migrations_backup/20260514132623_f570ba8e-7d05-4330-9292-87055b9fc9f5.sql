-- 1) Scope firm_internal_team access by firm membership
DROP POLICY IF EXISTS "Internal manage firm_internal_team" ON public.firm_internal_team;

CREATE POLICY "Admins manage firm_internal_team"
ON public.firm_internal_team
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Employees view firm_internal_team for accessible firms"
ON public.firm_internal_team
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'employee'::app_role)
  AND public.user_can_access_firm(firm_id)
);

-- 2) Lock down realtime.messages so users can only subscribe to topics
-- they are authorized for. Topics in this app use either the firm id
-- (firm-realtime-<uuid>) or the user's own id (notif-<uuid>).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read own realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated can read own realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Personal notification channel: notif-<auth.uid()>
  realtime.topic() = ('notif-' || auth.uid()::text)
  -- Firm realtime channel: firm-realtime-<firm_id> the user can access
  OR (
    realtime.topic() LIKE 'firm-realtime-%'
    AND public.user_can_access_firm(
      NULLIF(substring(realtime.topic() from 'firm-realtime-(.*)$'), '')::uuid
    )
  )
  -- Admins/super_admins may listen broadly
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);