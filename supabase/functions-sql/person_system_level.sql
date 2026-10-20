-- fn: public.person_system_level(uuid,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.person_system_level(p_person_id uuid, p_system_id uuid)
 RETURNS smallint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT CASE WHEN cr.expires_at IS NOT NULL AND cr.expires_at < public.project_today(cr.project_id) THEN 0 ELSE cr.level END
    FROM competency_records cr WHERE cr.person_id = p_person_id AND cr.system_id = p_system_id
    ORDER BY cr.assessed_at DESC, cr.created_at DESC LIMIT 1), 0)::smallint;
$function$;
