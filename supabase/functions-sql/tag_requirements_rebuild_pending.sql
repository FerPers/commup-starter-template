-- fn: public.tag_requirements_rebuild_pending()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_requirements_rebuild_pending()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; n int := 0;
BEGIN
  -- pg_cron «tag-requirements-rebuild» (cada minuto): recalcula enteros los proyectos que lo esperan, los más viejos
  -- primero y hasta 3 por vuelta; después actualiza las estadísticas de la tabla para que las lecturas planeen bien.
  FOR r IN SELECT s.project_id FROM tag_requirement_state s
           WHERE s.computed_version < s.version ORDER BY s.computed_at NULLS FIRST LIMIT 3 LOOP
    IF public.tag_requirements_rebuild(r.project_id) THEN n := n + 1; END IF;
  END LOOP;
  IF n > 0 THEN ANALYZE tag_requirement_rows; END IF;
  RETURN n;
END;
$function$;
