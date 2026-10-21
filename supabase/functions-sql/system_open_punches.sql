-- fn: public.system_open_punches(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.system_open_punches(p_project_id uuid)
 RETURNS TABLE(system_id uuid, open_a integer, open_b integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT ss.system_id,
         COUNT(*) FILTER (WHERE p.category = 'A')::int,
         COUNT(*) FILTER (WHERE p.category = 'B')::int
  FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id
  WHERE p.project_id = p_project_id AND p.status IN ('open', 'in_progress') AND p.category IN ('A', 'B')
  GROUP BY ss.system_id
$function$;
