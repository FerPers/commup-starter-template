-- fn: public.capacity_holders(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.capacity_holders(p_project_id uuid, p_capacity text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT pc.user_id FROM project_capacities pc
  JOIN org_members om ON om.org_id = pc.org_id AND om.user_id = pc.user_id AND om.status = 'active'
   AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  WHERE pc.project_id = p_project_id AND pc.capacity = p_capacity AND pc.revoked_at IS NULL
    AND public.capacity_designated(p_project_id, p_capacity)
  UNION
  SELECT om.user_id FROM projects p
  JOIN org_members om ON om.org_id = p.org_id AND om.status = 'active'
   AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  WHERE p.id = p_project_id AND NOT public.capacity_designated(p_project_id, p_capacity)
    AND om.role::text = ANY (public.capacity_fallback_roles(p_capacity))
$function$;
