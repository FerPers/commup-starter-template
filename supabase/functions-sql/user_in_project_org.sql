-- fn: public.user_in_project_org(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.user_in_project_org(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM projects pr
    JOIN org_members om ON om.org_id = pr.org_id
    WHERE pr.id = p_project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  )
$function$;
