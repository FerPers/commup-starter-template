-- fn: public.get_my_editor_project_ids()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.get_my_editor_project_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id FROM projects p
  JOIN org_members om ON om.org_id = p.org_id
  WHERE om.user_id = auth.uid() AND om.status = 'active' AND (om.access_expires_at IS NULL OR om.access_expires_at > now()) AND om.role IN ('owner','admin','architect','leader')
$function$;
