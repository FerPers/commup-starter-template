-- fn: public.is_project_field_member(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.is_project_field_member(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = p_project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
      AND om.role IN ('owner', 'admin', 'architect', 'leader', 'inspector')
  )
$function$;
