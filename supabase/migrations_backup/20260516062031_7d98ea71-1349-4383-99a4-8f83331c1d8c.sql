REVOKE EXECUTE ON FUNCTION public.claim_device_slot(text, text, text, inet) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_and_claim_device(text, text, text, text, inet) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.heartbeat_device(text) FROM PUBLIC, anon;