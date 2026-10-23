-- fn: public.tag_requirements_mark_projects(uuid[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_requirements_mark_projects(p_project_ids uuid[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- En orden y con bloqueo, como gate_status_mark (sin interbloqueos entre marcas concurrentes).
  WITH l AS (
    SELECT s.project_id FROM tag_requirement_state s
    WHERE s.project_id = ANY (p_project_ids)
    ORDER BY s.project_id
    FOR UPDATE
  )
  UPDATE tag_requirement_state s SET version = s.version + 1
  FROM l WHERE s.project_id = l.project_id
$function$;
