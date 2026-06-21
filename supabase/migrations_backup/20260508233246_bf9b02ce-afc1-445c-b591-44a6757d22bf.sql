CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role::text
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'finance_manager' THEN 3
    WHEN 'hr_manager' THEN 4
    WHEN 'employee' THEN 5
    WHEN 'client' THEN 6
    ELSE 99
  END
  LIMIT 1
$function$;