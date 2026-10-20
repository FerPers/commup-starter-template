-- fn: public.pssr_punch_blocker(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.pssr_punch_blocker(p_review_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NULLIF(concat_ws('; ',
    CASE WHEN count(*) FILTER (WHERE pu.startup_disposition IS NULL) > 0
      THEN count(*) FILTER (WHERE pu.startup_disposition IS NULL) || ' punch abierto(s) sin disposición para el arranque ('
           || string_agg(pu.punch_number, ', ' ORDER BY pu.punch_number) FILTER (WHERE pu.startup_disposition IS NULL) || ')' END,
    CASE WHEN count(*) FILTER (WHERE pu.startup_disposition = 'close_before_startup') > 0
      THEN count(*) FILTER (WHERE pu.startup_disposition = 'close_before_startup') || ' punch marcado(s) «cerrar antes del arranque» siguen abiertos ('
           || string_agg(pu.punch_number, ', ' ORDER BY pu.punch_number) FILTER (WHERE pu.startup_disposition = 'close_before_startup') || ')' END), '')
  FROM pssr_reviews r
  JOIN subsystems ss ON ss.system_id = r.system_id
  JOIN punches pu ON pu.subsystem_id = ss.id AND pu.project_id = r.project_id AND pu.status IN ('open', 'in_progress')
  WHERE r.id = p_review_id;
$function$;
