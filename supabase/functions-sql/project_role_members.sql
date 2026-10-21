-- fn: public.project_role_members(uuid,text[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.project_role_members(p_project_id uuid, p_roles text[])
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT om.user_id FROM projects p
  JOIN org_members om ON om.org_id = p.org_id AND om.status = 'active'
   AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  WHERE p.id = p_project_id AND om.role::text = ANY (p_roles)
$function$;
