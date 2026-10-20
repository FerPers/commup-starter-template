-- fn: public.has_capacity(uuid,text,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.has_capacity(p_project_id uuid, p_capacity text, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN public.capacity_designated(p_project_id, p_capacity) THEN EXISTS (
      SELECT 1 FROM project_capacities pc
      JOIN org_members om ON om.org_id = pc.org_id AND om.user_id = pc.user_id AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
      WHERE pc.project_id = p_project_id AND pc.capacity = p_capacity AND pc.user_id = p_user_id AND pc.revoked_at IS NULL)
    ELSE COALESCE((
      SELECT om.role::text = ANY (public.capacity_fallback_roles(p_capacity))
      FROM projects p JOIN org_members om ON om.org_id = p.org_id AND om.user_id = p_user_id AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
      WHERE p.id = p_project_id), false)
  END;
$function$;
