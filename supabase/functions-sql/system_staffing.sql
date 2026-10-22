-- fn: public.system_staffing(uuid,integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.system_staffing(p_system_id uuid, p_level integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- S25 (E-11): los turnos esperados salen del personal activo del proyecto (no de quienes ya fueron evaluados en el
  -- sistema): un turno sin nadie competente cuenta 0 y no pasa. Sin turnos cargados, todos forman un solo grupo «—»;
  -- con turnos cargados, quien no tiene turno no abre uno propio.
  WITH roster AS (
    SELECT op.id, NULLIF(btrim(op.shift), '') AS shift, public.person_system_level(op.id, p_system_id) AS lvl
    FROM ops_personnel op JOIN systems s ON s.id = p_system_id AND s.project_id = op.project_id
    WHERE op.active
  ),
  people AS (
    SELECT * FROM roster WHERE shift IS NOT NULL OR NOT EXISTS (SELECT 1 FROM roster WHERE shift IS NOT NULL)
  ),
  target AS (SELECT COALESCE((SELECT required FROM system_competency_targets WHERE system_id = p_system_id), 2) AS req),
  shifts AS (
    SELECT COALESCE(shift, '—') AS shift, COUNT(*) FILTER (WHERE lvl >= p_level) AS ok FROM people
    GROUP BY COALESCE(shift, '—')
  )
  SELECT jsonb_build_object(
    'level', p_level, 'required', (SELECT req FROM target),
    'by_shift', COALESCE((SELECT jsonb_agg(jsonb_build_object('shift', shift, 'count', ok) ORDER BY shift) FROM shifts), '[]'::jsonb),
    'ok', EXISTS (SELECT 1 FROM shifts) AND NOT EXISTS (SELECT 1 FROM shifts WHERE ok < (SELECT req FROM target)));
$function$;
