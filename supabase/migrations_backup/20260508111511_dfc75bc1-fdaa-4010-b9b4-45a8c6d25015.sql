-- Allow internal users (admin/employee) to insert time_logs on behalf of any user (for collaborator co-tracking)
CREATE POLICY "Internal insert collaborator time"
ON public.time_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'employee'::app_role)
);

-- Allow internal users to stop (update) collaborator time logs they started
CREATE POLICY "Internal update collaborator time"
ON public.time_logs
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'employee'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'employee'::app_role)
);
