-- fn: public.punch_caller_role(punches)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.punch_caller_role(p_punch punches)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT om.role::text
  FROM projects p JOIN org_members om ON om.org_id = p.org_id AND om.user_id = auth.uid()
  WHERE p.id = p_punch.project_id AND public.is_project_member(p_punch.project_id);
$function$;
