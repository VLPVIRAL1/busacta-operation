-- TEMP open access: grant every existing and future user all three app roles
-- so they can switch portals freely and pass RLS checks while we finalize.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, r.role
FROM auth.users u
CROSS JOIN (VALUES ('admin'::public.app_role), ('employee'::public.app_role), ('client'::public.app_role)) AS r(role)
ON CONFLICT (user_id, role) DO NOTHING;

-- Update handle_new_user so every new signup also gets all three roles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  -- TEMP open access: grant all three roles to the new user.
  INSERT INTO public.user_roles (user_id, role)
  VALUES
    (NEW.id, 'admin'::public.app_role),
    (NEW.id, 'employee'::public.app_role),
    (NEW.id, 'client'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;