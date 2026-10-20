-- fn: public.org_caller_role(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.org_caller_role(p_org_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT om.role::text FROM org_members om WHERE om.org_id = p_org_id AND om.user_id = auth.uid() AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now());
$function$;
