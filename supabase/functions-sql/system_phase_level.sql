-- fn: public.system_phase_level(uuid, uuid, integer, timestamp with time zone)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.system_phase_level(p_system_id uuid, p_phase_id uuid, p_limit integer, p_punches_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH ss AS (
    SELECT s.id, s.code FROM subsystems s WHERE s.system_id = p_system_id
  ),
  pun AS (
    SELECT p.subsystem_id,
           COUNT(*) FILTER (WHERE p.category = 'A') AS a,
           COUNT(*) FILTER (WHERE p.category = 'B') AS b
    FROM punches p
    WHERE p.subsystem_id IN (SELECT id FROM ss)
      AND p.status IN ('open', 'in_progress')
      -- S11 (D-13): para un gate ya aprobado solo cuentan los punch anteriores a su aprobación
      AND (p_punches_before IS NULL OR p.created_at < p_punches_before)
    GROUP BY p.subsystem_id
  ),
  it AS (
    SELECT i.subsystem_id,
           COUNT(*) AS t,
           COUNT(*) FILTER (WHERE i.status = 'approved') AS ap,
           -- A08 (E4): ITR no conformes (falla crítica): bloquean, no son trabajo pendiente.
           COUNT(*) FILTER (WHERE i.status = 'rejected') AS rj
    FROM itrs i
    WHERE i.subsystem_id IN (SELECT id FROM ss)
      AND i.phase_id = p_phase_id
    GROUP BY i.subsystem_id
  ),
  lvl AS (
    SELECT ss.id, ss.code,
           COALESCE(it.t, 0) AS t, COALESCE(it.ap, 0) AS ap, COALESCE(it.rj, 0) AS rj,
           COALESCE(pun.a, 0) AS a, COALESCE(pun.b, 0) AS b,
           CASE
             WHEN COALESCE(pun.a, 0) > 0 THEN 'cat_a'
             WHEN COALESCE(it.t, 0) = 0 THEN 'no_itrs'
             WHEN COALESCE(it.ap, 0) < COALESCE(it.t, 0) THEN 'itrs_pending'
             WHEN p_limit IS NOT NULL AND COALESCE(pun.b, 0) > p_limit THEN 'cat_b_over_limit'
           END AS red_reason,
           CASE
             WHEN COALESCE(pun.a, 0) > 0
               OR COALESCE(it.t, 0) = 0
               OR COALESCE(it.ap, 0) < COALESCE(it.t, 0)
               OR (p_limit IS NOT NULL AND COALESCE(pun.b, 0) > p_limit) THEN 'red'
             WHEN COALESCE(pun.b, 0) > 0 THEN 'yellow'
             ELSE 'green'
           END AS level
    FROM ss
    LEFT JOIN it  ON it.subsystem_id = ss.id
    LEFT JOIN pun ON pun.subsystem_id = ss.id
  )
  SELECT jsonb_build_object(
    'level', CASE WHEN COUNT(*) = 0 OR COUNT(*) FILTER (WHERE level = 'red') > 0 THEN 'red'
                  WHEN COUNT(*) FILTER (WHERE level = 'yellow') > 0 THEN 'yellow'
                  ELSE 'green' END,
    'subsystems_total',  COUNT(*),
    'subsystems_red',    COUNT(*) FILTER (WHERE level = 'red'),
    'subsystems_yellow', COUNT(*) FILTER (WHERE level = 'yellow'),
    'itr_total',         COALESCE(SUM(t), 0),
    'itr_approved',      COALESCE(SUM(ap), 0),
    'itr_rejected',      COALESCE(SUM(rj), 0),
    'open_cat_a',        COALESCE(SUM(a), 0),
    'open_cat_b',        COALESCE(SUM(b), 0),
    'red_subsystems',    COALESCE(jsonb_agg(jsonb_build_object(
                            'id', id, 'code', code, 'reason', red_reason,
                            'itr_total', t, 'itr_approved', ap, 'open_a', a, 'open_b', b)
                          ORDER BY code) FILTER (WHERE level = 'red'), '[]'::jsonb)
  )
  FROM lvl;
$function$;
