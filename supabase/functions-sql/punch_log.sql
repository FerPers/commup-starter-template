-- fn: public.punch_log(punches, text, jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.punch_log(p_punch punches, p_action text, p_payload jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  SELECT p.org_id, auth.uid(), 'punch', p_punch.id, p_action, p_payload
  FROM projects p WHERE p.id = p_punch.project_id AND auth.uid() IS NOT NULL;
$function$;
