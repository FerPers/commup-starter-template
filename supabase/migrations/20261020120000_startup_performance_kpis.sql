-- Fase 7, sesión 3 (decisiones de Luis, 2026-10-19; doc §11.13 y §14): KPIs de gestión que dependían de F6/F7,
-- sumados al snapshot diario `take_mgmt_snapshot` (mgmt_kpi_snapshots.kpis):
--   startup     — éxito de primer arranque: un sistema con «primer arranque» atestiguado es exitoso si llega a
--                 «operación estable» atestiguada sin ningún trip/parada entre ambos hitos; falla si tuvo un
--                 trip/parada desde el primer arranque sin haber llegado aún a operación estable (o antes de ella);
--                 pendiente si no hay ni operación estable ni trip.
--   trips       — falla repetida (F6): trips/paradas en 30 días y sistemas con 2 o más.
--   performance — falla repetida (F7): pruebas con algún intento evaluado, aceptadas (aceptado o aceptado con
--                 desviación) y aceptadas al primer intento evaluado (los abortados no cuentan como intento).
-- Se insertan al final del jsonb de KPIs reemplazando un ancla única del cuerpo vigente.

DO $patch$
DECLARE
  v_def text;
  v_anchor text := E'             AND a.approved_at >= v_from AND a.approved_at < v_to)\n  ) INTO v_kpis;';
  v_new text := $ins$             AND a.approved_at >= v_from AND a.approved_at < v_to),
    -- Éxito de primer arranque (F6, decisión 2026-10-19): sin trip/parada entre «primer arranque» y «operación estable».
    'startup', (SELECT jsonb_build_object(
             'started', COUNT(*),
             'successful', COUNT(*) FILTER (WHERE s.stable_at IS NOT NULL AND NOT s.tripped),
             'failed', COUNT(*) FILTER (WHERE s.tripped),
             'pending', COUNT(*) FILTER (WHERE s.stable_at IS NULL AND NOT s.tripped))
           FROM (SELECT fs.system_id, st.stable_at,
                        EXISTS (SELECT 1 FROM startup_events e
                                WHERE e.system_id = fs.system_id AND e.kind = 'free' AND e.category IN ('trip', 'shutdown')
                                  AND e.status <> 'voided' AND e.occurred_at >= fs.occurred_at
                                  AND e.occurred_at < LEAST(v_to, COALESCE(st.stable_at, v_to))) AS tripped
                 FROM startup_events fs
                 LEFT JOIN LATERAL (SELECT MIN(x.occurred_at) AS stable_at FROM startup_events x
                                    WHERE x.system_id = fs.system_id AND x.kind = 'milestone' AND x.milestone = 'first_stable_operation'
                                      AND x.status = 'witnessed' AND x.occurred_at < v_to) st ON true
                 WHERE fs.project_id = p_project_id AND fs.kind = 'milestone' AND fs.milestone = 'first_startup'
                   AND fs.status = 'witnessed' AND fs.occurred_at < v_to) s),
    -- Falla repetida (F6): trips/paradas en la ventana y sistemas con 2 o más.
    'trips', (SELECT jsonb_build_object(
             'events_30d', COALESCE(SUM(x.n), 0),
             'systems_30d', COUNT(*),
             'repeat_systems_30d', COUNT(*) FILTER (WHERE x.n >= 2))
           FROM (SELECT e.system_id, COUNT(*) AS n FROM startup_events e
                 WHERE e.project_id = p_project_id AND e.kind = 'free' AND e.category IN ('trip', 'shutdown')
                   AND e.status <> 'voided' AND e.occurred_at >= v_from AND e.occurred_at < v_to
                 GROUP BY e.system_id) x),
    -- Falla repetida (F7): pruebas de desempeño aceptadas al primer intento evaluado.
    'performance', (SELECT jsonb_build_object(
             'tests', COUNT(*),
             'accepted', COUNT(*) FILTER (WHERE a.acc_attempt IS NOT NULL),
             'accepted_first', COUNT(*) FILTER (WHERE a.acc_attempt IS NOT NULL AND a.prior = 0),
             'failed_runs', COALESCE(SUM(a.failed), 0))
           FROM performance_tests t
           CROSS JOIN LATERAL (
             SELECT MIN(pr.attempt) FILTER (WHERE pr.result IN ('accepted', 'accepted_with_deviation')) AS acc_attempt,
                    COUNT(*) FILTER (WHERE pr.result = 'failed') AS failed,
                    COUNT(*) FILTER (WHERE pr.attempt < (SELECT MIN(pr2.attempt) FROM performance_runs pr2
                                                          WHERE pr2.test_id = t.id AND pr2.result IN ('accepted', 'accepted_with_deviation')
                                                            AND pr2.result_at < v_to)) AS prior,
                    COUNT(*) AS evaluated
             FROM performance_runs pr
             WHERE pr.test_id = t.id AND pr.status = 'evaluated' AND pr.result_at < v_to) a
           WHERE t.project_id = p_project_id AND a.evaluated > 0)
  ) INTO v_kpis;$ins$;
BEGIN
  v_def := pg_get_functiondef('public.take_mgmt_snapshot(uuid, date)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'take_mgmt_snapshot: ancla no encontrada o repetida';
  END IF;
  EXECUTE replace(v_def, v_anchor, v_new);
END;
$patch$;
