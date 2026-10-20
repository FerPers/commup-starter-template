-- fn: public.upsert_push_subscription(text,text,text,text[],jsonb,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.upsert_push_subscription(p_endpoint text, p_p256dh text, p_auth_secret text, p_topics text[], p_device_info jsonb, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_user_id uuid := auth.uid(); v_org_id uuid; v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_org_id IS NOT NULL THEN
    IF p_org_id NOT IN (SELECT public.get_my_org_ids()) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
    v_org_id := p_org_id;
  ELSE
    SELECT org_id INTO v_org_id FROM public.get_my_org_ids() g(org_id) LIMIT 1;
  END IF;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'User has no organization membership'; END IF;
  INSERT INTO push_subscriptions (org_id, user_id, endpoint, p256dh, auth_secret, topics, device_info, enabled, failure_count)
  VALUES (v_org_id, v_user_id, p_endpoint, p_p256dh, p_auth_secret, p_topics, p_device_info, true, 0)
  ON CONFLICT (user_id, endpoint) DO UPDATE
    SET org_id = EXCLUDED.org_id, p256dh = EXCLUDED.p256dh, auth_secret = EXCLUDED.auth_secret, topics = EXCLUDED.topics,
        device_info = EXCLUDED.device_info, enabled = true, failure_count = 0, updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
