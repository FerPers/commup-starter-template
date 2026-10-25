-- A47 · E4 (plan docs/PLAN-A08-A25-A47-A19-2026-10-25.md, D7 aprobada por Luis el 2026-10-25): la matriz de liberación
-- distingue tres «no listo». Antes todo gate no listo se pintaba igual (bloqueado), aunque fuera trabajo en curso o
-- un sistema sin alcance conocido. Ahora:
--   - gate_work_state(status, criterios) = blocked · nodata · work (null si el gate no está «no listo»). Un gate
--     anterior o un sistema proveedor sin liberar es «work» (secuencia normal); bloquea solo en regresión (Luis,
--     2026-10-25). Lógica en el
--     archivo canónico; espejo TS en src/lib/readiness/work-state.ts, paridad en tests/db/gate-work-state-parity.test.ts.
--   - system_phase_level suma itr_rejected (ITR no conformes) y open_cat_a a los totales del criterio de ITR.
--   - gate_status_compute guarda work_state en cada gate de system_gate_status.gates (sin cambiar la firma de
--     compute_project_gates).
--   - Todos los sistemas quedan sucios: el cron gate-status-refresh y la primera lectura de cada proyecto los
--     recalculan con work_state (no cambia ningún estado, solo se agrega la causa).
-- Funciones canónicas: system_phase_level, gate_work_state (nueva), gate_status_compute.

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


CREATE OR REPLACE FUNCTION public.gate_work_state(p_status text, p_criteria jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  -- A08 (E4, D7 del plan docs/PLAN-A08-A25-A47-A19-2026-10-25.md): un gate «no listo» se lee según su causa.
  --   blocked = algo que no se resuelve haciendo el trabajo planeado: Cat A abierto, ITR no conforme o Cat B sobre el
  --             tope en algún subsistema; gate anterior o sistema proveedor en regresión; registro controlado o
  --             restricción en nivel 4 que bloquean;
  --   nodata  = la fase no tiene ITR en el alcance del sistema (o el gate no tiene fase): no se sabe qué falta;
  --   work    = trabajo en curso (ITR por aprobar, gate anterior o proveedor sin liberar, certificados, PSSR, line-up…).
  -- Luis, 2026-10-25: una dependencia sin liberar es la secuencia normal (como el gate anterior); bloquea solo si el
  -- proveedor está en regresión.
  -- Espejo en TS: src/lib/readiness/work-state.ts (paridad en tests/db/gate-work-state-parity.test.ts).
  SELECT CASE
    WHEN p_status IS DISTINCT FROM 'not_ready' THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_criteria, '[]'::jsonb)) cr
      WHERE cr ->> 'result' = 'fail' AND (
           cr ->> 'kind' IN ('registers_clear', 'constraints_clear')
        OR (cr ->> 'kind' = 'previous_gate' AND COALESCE((cr -> 'detail' ->> 'regressed')::boolean, false))
        OR (cr ->> 'kind' = 'dependencies_ready' AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(cr -> 'detail' -> 'dependencies', '[]'::jsonb)) dp
              WHERE dp ->> 'provider_status' = 'regressed'))
        OR (cr ->> 'kind' = 'itr_phase_approved' AND (
              COALESCE((cr -> 'detail' ->> 'open_cat_a')::int, 0) > 0
           OR COALESCE((cr -> 'detail' ->> 'itr_rejected')::int, 0) > 0
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(cr -> 'detail' -> 'red_subsystems', '[]'::jsonb)) rs
                      WHERE rs ->> 'reason' IN ('cat_a', 'cat_b_over_limit'))))))
      THEN 'blocked'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_criteria, '[]'::jsonb)) cr
      WHERE cr ->> 'kind' = 'itr_phase_approved' AND cr ->> 'result' = 'fail'
        AND (cr -> 'detail' ? 'error' OR COALESCE((cr -> 'detail' ->> 'itr_total')::int, 0) = 0))
      THEN 'nodata'
    ELSE 'work'
  END
$function$;


CREATE OR REPLACE FUNCTION public.gate_status_compute(p_system_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'gate_id', g.gate_id, 'code', g.gate_code, 'name', g.gate_name,
           'order', g.gate_order, 'computed_level', g.computed_level, 'status', g.status,
           'failing', (SELECT COUNT(*) FROM jsonb_array_elements(g.criteria) cr WHERE cr ->> 'result' = 'fail'),
           'approval', g.approval,
           -- A08 (E4): «no listo» según su causa (nodata · work · blocked); null en los demás estados.
           'work_state', public.gate_work_state(g.status, g.criteria),
           -- S23 (D-01): primer criterio que falla (bloqueante), sin las listas del detalle, para la fila de la matriz.
           'blocker', (SELECT jsonb_build_object('kind', cr ->> 'kind', 'label', cr ->> 'label',
                         'detail', (SELECT COALESCE(jsonb_object_agg(d.key, d.value), '{}'::jsonb)
                                    FROM jsonb_each(COALESCE(cr -> 'detail', '{}'::jsonb)) d
                                    WHERE jsonb_typeof(d.value) NOT IN ('array', 'object')))
                       FROM jsonb_array_elements(g.criteria) WITH ORDINALITY AS c(cr, ord)
                       WHERE cr ->> 'result' = 'fail'
                       ORDER BY c.ord LIMIT 1)
         ) ORDER BY g.gate_order, g.gate_code), '[]'::jsonb)
  FROM public.compute_system_gates(p_system_id) g
$function$;


REVOKE ALL ON FUNCTION public.gate_work_state(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gate_work_state(text, jsonb) TO authenticated, service_role;

UPDATE public.system_gate_status SET version = version + 1;
