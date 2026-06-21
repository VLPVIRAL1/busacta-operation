REVOKE EXECUTE ON FUNCTION public.user_can_view_thread(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_view_thread(uuid, uuid) TO authenticated;