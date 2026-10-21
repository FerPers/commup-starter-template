-- fn: public.notify_users(uuid,uuid[],text,text,text,text,jsonb,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.notify_users(p_org_id uuid, p_users uuid[], p_kind text, p_title text, p_body text, p_link text, p_payload jsonb DEFAULT '{}'::jsonb, p_dedupe_key text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_n integer;
BEGIN
  INSERT INTO notifications (org_id, recipient_user_id, kind, title, body, link_url, payload)
  SELECT p_org_id, u.id, p_kind, left(p_title, 200), left(p_body, 1000), p_link,
         COALESCE(p_payload, '{}'::jsonb) || CASE WHEN p_dedupe_key IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('key', p_dedupe_key) END
  FROM (SELECT DISTINCT x AS id FROM unnest(p_users) x WHERE x IS NOT NULL) u
  JOIN org_members om ON om.org_id = p_org_id AND om.user_id = u.id AND om.status = 'active'
   AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  WHERE u.id IS DISTINCT FROM auth.uid()
    AND (p_dedupe_key IS NULL OR NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.recipient_user_id = u.id AND n.kind = p_kind AND n.payload ->> 'key' = p_dedupe_key
        AND n.created_at > now() - interval '24 hours'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;
