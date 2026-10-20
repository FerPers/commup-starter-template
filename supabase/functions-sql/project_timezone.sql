-- fn: public.project_timezone(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.project_timezone(p_project_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$ SELECT COALESCE((SELECT timezone FROM public.projects WHERE id = p_project_id), 'UTC') $function$;
