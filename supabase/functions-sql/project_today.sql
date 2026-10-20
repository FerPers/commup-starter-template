-- fn: public.project_today(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.project_today(p_project_id uuid)
 RETURNS date
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$ SELECT public.tz_today(public.project_timezone(p_project_id)) $function$;
