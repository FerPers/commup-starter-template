-- ══════════════════════════════════════════════════════════════
-- Stage 15 — Analytics & AI Operacional
-- 15.1 Predicción de retrasos (regresión sobre domain_events)
-- 15.2 Detección de cuellos de botella (grafo system → blockers)
-- 15.3 Data quality checks (ITRs inconsistentes, loops sin tags, …)
-- 15.4 Soporte para panel /admin/data-quality
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 15.1 — FORECAST / Predicción de retrasos
-- ─────────────────────────────────────────────────────────────
-- Velocidad = count(transiciones itr.status → 'approved') por día,
-- calculado desde domain_events en los últimos 30 / 90 días.
-- Forecast lineal: days_to_complete = remaining / velocity_per_day.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW analytics_subsystem_velocity AS
WITH approvals AS (
  SELECT
    ((de.payload->'new')->>'subsystem_id')::UUID AS subsystem_id,
    de.occurred_at
  FROM domain_events de
  WHERE de.aggregate_type = 'itrs'
    AND de.event_type = 'itrs.updated'
    AND (de.payload->'new')->>'status' = 'approved'
    AND ((de.payload->'old')->>'status') IS DISTINCT FROM 'approved'
)
SELECT
  s.id                                                     AS subsystem_id,
  s.project_id,
  p.org_id,
  COUNT(a.*) FILTER (WHERE a.occurred_at >= NOW() - INTERVAL '30 days') AS approvals_30d,
  COUNT(a.*) FILTER (WHERE a.occurred_at >= NOW() - INTERVAL '90 days') AS approvals_90d,
  -- velocidad diaria (suavizado 30d)
  ROUND(
    (COUNT(a.*) FILTER (WHERE a.occurred_at >= NOW() - INTERVAL '30 days'))::NUMERIC / 30.0,
    3
  ) AS velocity_per_day_30d
FROM subsystems s
JOIN projects p ON p.id = s.project_id
LEFT JOIN approvals a ON a.subsystem_id = s.id
GROUP BY s.id, s.project_id, p.org_id;

COMMENT ON VIEW analytics_subsystem_velocity IS
  'Velocidad de aprobaciones ITR por subsystem desde domain_events (ventanas 30d/90d).';


CREATE OR REPLACE VIEW analytics_subsystem_progress AS
SELECT
  s.id                                                   AS subsystem_id,
  s.project_id,
  p.org_id,
  s.name                                                 AS subsystem_name,
  s.code                                                 AS subsystem_code,
  s.completion_pct,
  sys.id                                                 AS system_id,
  sys.name                                               AS system_name,
  COUNT(DISTINCT i.id)                                   AS total_itrs,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'approved')    AS itrs_approved,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'rejected')    AS itrs_rejected,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'in_progress') AS itrs_in_progress,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'not_started') AS itrs_not_started,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'completed')   AS itrs_completed,
  -- pendientes = todo lo que no está approved
  COUNT(DISTINCT i.id) FILTER (WHERE i.status <> 'approved')   AS itrs_remaining,
  -- punches por categoría (abiertos = status != 'closed' y != 'cancelled')
  COUNT(DISTINCT pu.id) FILTER (WHERE pu.category = 'A' AND pu.status NOT IN ('closed','cancelled')) AS punch_a_open,
  COUNT(DISTINCT pu.id) FILTER (WHERE pu.category = 'B' AND pu.status NOT IN ('closed','cancelled')) AS punch_b_open,
  COUNT(DISTINCT pu.id) FILTER (WHERE pu.category = 'C' AND pu.status NOT IN ('closed','cancelled')) AS punch_c_open,
  COUNT(DISTINCT pu.id) FILTER (WHERE pu.status = 'closed')    AS punches_closed
FROM subsystems s
JOIN projects p ON p.id = s.project_id
JOIN systems sys ON sys.id = s.system_id
LEFT JOIN itrs i    ON i.subsystem_id = s.id
LEFT JOIN punches pu ON pu.subsystem_id = s.id
GROUP BY s.id, s.project_id, p.org_id, s.name, s.code, s.completion_pct,
         sys.id, sys.name;


-- Forecast por proyecto con P50 (mediana). Regresión simple:
--   days_remaining_p50 = remaining / max(velocity_per_day, 0.1)
-- Confianza: baja si velocity=0, alta si hay historial consistente.
CREATE OR REPLACE FUNCTION analytics_project_forecast(p_project_id UUID)
RETURNS TABLE (
  project_id              UUID,
  total_itrs              BIGINT,
  itrs_approved           BIGINT,
  itrs_remaining          BIGINT,
  velocity_per_day        NUMERIC,
  days_to_complete_p50    NUMERIC,
  eta_p50                 DATE,
  confidence              TEXT,
  punch_a_open            BIGINT,
  blockers                BIGINT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT
      SUM(ap.total_itrs)       AS total_itrs,
      SUM(ap.itrs_approved)    AS itrs_approved,
      SUM(ap.itrs_remaining)   AS itrs_remaining,
      SUM(ap.punch_a_open)     AS punch_a_open,
      AVG(av.velocity_per_day_30d) AS velocity_per_day
    FROM analytics_subsystem_progress ap
    JOIN analytics_subsystem_velocity av ON av.subsystem_id = ap.subsystem_id
    WHERE ap.project_id = p_project_id
  ),
  calc AS (
    SELECT
      total_itrs,
      itrs_approved,
      itrs_remaining,
      punch_a_open,
      velocity_per_day,
      CASE
        WHEN itrs_remaining = 0 THEN 0
        WHEN COALESCE(velocity_per_day, 0) <= 0 THEN NULL
        ELSE ROUND(itrs_remaining / velocity_per_day, 1)
      END AS days_p50
    FROM base
  )
  SELECT
    p_project_id,
    COALESCE(total_itrs, 0),
    COALESCE(itrs_approved, 0),
    COALESCE(itrs_remaining, 0),
    ROUND(COALESCE(velocity_per_day, 0), 3),
    days_p50,
    CASE WHEN days_p50 IS NULL THEN NULL ELSE (CURRENT_DATE + (days_p50 || ' days')::INTERVAL)::DATE END,
    CASE
      WHEN days_p50 IS NULL THEN 'low'
      WHEN velocity_per_day >= 0.5 THEN 'high'
      WHEN velocity_per_day >= 0.1 THEN 'medium'
      ELSE 'low'
    END,
    COALESCE(punch_a_open, 0),
    COALESCE(punch_a_open, 0)  -- proxy: Cat A abiertos bloquean MC
  FROM calc;
$$;

REVOKE ALL ON FUNCTION analytics_project_forecast(UUID) FROM public;
GRANT EXECUTE ON FUNCTION analytics_project_forecast(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 15.2 — BOTTLENECK DETECTION (grafo system → blockers)
-- ─────────────────────────────────────────────────────────────
-- Ranking de subsystems por "bottleneck_score" (0..100).
-- Factores ponderados:
--   +40 si tiene punches Cat A abiertos
--   +25 si velocidad de aprobación ITR = 0 en últimos 14d y tiene ITRs pendientes
--   +20 si ratio punches/itrs > 1 (más issues que inspecciones)
--   +10 si tiene certificado 'issued'=false y Cat A abiertos
--   +5 por cada rechazo reciente de ITR (cap a +15)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW analytics_bottlenecks AS
WITH recent_rejects AS (
  SELECT
    ((de.payload->'new')->>'subsystem_id')::UUID AS subsystem_id,
    COUNT(*) AS n
  FROM domain_events de
  WHERE de.aggregate_type = 'itrs'
    AND de.event_type = 'itrs.updated'
    AND (de.payload->'new')->>'status' = 'rejected'
    AND de.occurred_at >= NOW() - INTERVAL '30 days'
  GROUP BY 1
),
stalled AS (
  SELECT s.id AS subsystem_id
  FROM subsystems s
  LEFT JOIN domain_events de
    ON de.aggregate_type = 'itrs'
   AND de.event_type = 'itrs.updated'
   AND ((de.payload->'new')->>'subsystem_id')::UUID = s.id
   AND (de.payload->'new')->>'status' = 'approved'
   AND de.occurred_at >= NOW() - INTERVAL '14 days'
  GROUP BY s.id
  HAVING COUNT(de.*) = 0
)
SELECT
  ap.subsystem_id,
  ap.project_id,
  ap.org_id,
  ap.subsystem_code,
  ap.subsystem_name,
  ap.system_id,
  ap.system_name,
  ap.itrs_remaining,
  ap.punch_a_open,
  ap.punch_b_open,
  ap.punch_c_open,
  COALESCE(rj.n, 0)                       AS recent_rejects,
  ap.total_itrs,
  ap.itrs_approved,
  -- score
  LEAST(
    100,
    (CASE WHEN ap.punch_a_open > 0 THEN 40 ELSE 0 END) +
    (CASE WHEN st.subsystem_id IS NOT NULL AND ap.itrs_remaining > 0 THEN 25 ELSE 0 END) +
    (CASE WHEN ap.total_itrs > 0 AND (ap.punch_a_open + ap.punch_b_open + ap.punch_c_open) > ap.total_itrs THEN 20 ELSE 0 END) +
    (CASE WHEN EXISTS (
        SELECT 1 FROM certificates c
        WHERE c.subsystem_id = ap.subsystem_id
          AND c.status <> 'issued'
      ) AND ap.punch_a_open > 0 THEN 10 ELSE 0 END) +
    LEAST(15, COALESCE(rj.n, 0) * 5)
  ) AS bottleneck_score,
  -- razones humanas para UI
  ARRAY_REMOVE(ARRAY[
    CASE WHEN ap.punch_a_open > 0 THEN 'punch_a_open' END,
    CASE WHEN st.subsystem_id IS NOT NULL AND ap.itrs_remaining > 0 THEN 'no_velocity_14d' END,
    CASE WHEN ap.total_itrs > 0 AND (ap.punch_a_open + ap.punch_b_open + ap.punch_c_open) > ap.total_itrs THEN 'punch_ratio_high' END,
    CASE WHEN EXISTS (
        SELECT 1 FROM certificates c
        WHERE c.subsystem_id = ap.subsystem_id
          AND c.status <> 'issued'
      ) AND ap.punch_a_open > 0 THEN 'cert_blocked' END,
    CASE WHEN COALESCE(rj.n, 0) > 0 THEN 'recent_rejections' END
  ], NULL) AS reasons
FROM analytics_subsystem_progress ap
LEFT JOIN recent_rejects rj ON rj.subsystem_id = ap.subsystem_id
LEFT JOIN stalled st        ON st.subsystem_id = ap.subsystem_id;

COMMENT ON VIEW analytics_bottlenecks IS
  'Score 0..100 por subsystem. Ordenar DESC para cuellos de botella críticos.';


-- ─────────────────────────────────────────────────────────────
-- 15.3 — DATA QUALITY CHECKS
-- ─────────────────────────────────────────────────────────────
-- Reglas ejecutadas en SQL. Cada fila = 1 issue detectado.
-- severity: critical | error | warning
-- category: itr_integrity | punch_orphans | loop_coverage |
--           certificate_prereqs | date_logic | system_completeness
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW data_quality_issues AS

-- 3.1 ITR aprobado sin firma executor
SELECT
  'critical'::TEXT                            AS severity,
  'itr_integrity'::TEXT                       AS category,
  'itr'::TEXT                                 AS entity_type,
  i.id                                        AS entity_id,
  i.itr_number                                AS entity_label,
  i.project_id,
  p.org_id,
  'ITR aprobado sin firma de ejecutor'        AS description,
  'Solicitar firma antes de validar aprobación' AS suggested_fix,
  '/projects/' || i.project_id || '/itrs/' || i.id AS fix_url
FROM itrs i
JOIN projects p ON p.id = i.project_id
WHERE i.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM itr_signatures s
    WHERE s.itr_id = i.id AND s.role = 'executor'
  )

UNION ALL

-- 3.2 ITR con progress_pct 100 pero status no approved/completed
SELECT
  'warning', 'itr_integrity', 'itr', i.id, i.itr_number, i.project_id, p.org_id,
  'ITR con progreso 100% pero status=' || i.status,
  'Revisar estado del ITR y avanzar a completed/approved',
  '/projects/' || i.project_id || '/itrs/' || i.id
FROM itrs i
JOIN projects p ON p.id = i.project_id
WHERE i.progress_pct >= 100
  AND i.status NOT IN ('approved','completed')

UNION ALL

-- 3.3 ITR approved pero progress_pct < 100
SELECT
  'error', 'itr_integrity', 'itr', i.id, i.itr_number, i.project_id, p.org_id,
  'ITR aprobado con progreso ' || COALESCE(i.progress_pct,0) || '%',
  'Completar todos los items antes de aprobar, o revisar aprobación',
  '/projects/' || i.project_id || '/itrs/' || i.id
FROM itrs i
JOIN projects p ON p.id = i.project_id
WHERE i.status = 'approved' AND COALESCE(i.progress_pct, 0) < 100

UNION ALL

-- 3.4 ITR completed_date < created_at (lógica de fechas)
SELECT
  'error', 'date_logic', 'itr', i.id, i.itr_number, i.project_id, p.org_id,
  'ITR con completed_date (' || i.completed_date || ') anterior a created_at (' || i.created_at::DATE || ')',
  'Corregir fechas. Posible carga manual incorrecta.',
  '/projects/' || i.project_id || '/itrs/' || i.id
FROM itrs i
JOIN projects p ON p.id = i.project_id
WHERE i.completed_date IS NOT NULL
  AND i.completed_date < i.created_at::DATE

UNION ALL

-- 3.5 Punch Cat A abierto sin asignar
SELECT
  'critical', 'punch_orphans', 'punch', pu.id, pu.punch_number, pu.project_id, pr.org_id,
  'Punch Cat A ' || pu.punch_number || ' sin ejecutor asignado',
  'Asignar ejecutor responsable. Bloquea Mechanical Completion.',
  '/projects/' || pu.project_id || '/punch-list/' || pu.id
FROM punches pu
JOIN projects pr ON pr.id = pu.project_id
WHERE pu.category = 'A'
  AND pu.status NOT IN ('closed','cancelled')
  AND pu.assigned_to IS NULL

UNION ALL

-- 3.6 Punch cerrado con closed_date anterior a created_at
SELECT
  'error', 'date_logic', 'punch', pu.id, pu.punch_number, pu.project_id, pr.org_id,
  'Punch ' || pu.punch_number || ' con closed_date anterior a creación',
  'Corregir fechas del punch',
  '/projects/' || pu.project_id || '/punch-list/' || pu.id
FROM punches pu
JOIN projects pr ON pr.id = pu.project_id
WHERE pu.closed_date IS NOT NULL
  AND pu.closed_date < pu.created_at::DATE

UNION ALL

-- 3.7 Loop sin tags (loop_tags vacío)
SELECT
  'warning', 'loop_coverage', 'loop', l.id, l.loop_number, l.project_id, pr.org_id,
  'Loop ' || l.loop_number || ' sin instrumentos asignados',
  'Vincular tags al loop desde el módulo de Loops',
  '/projects/' || l.project_id || '/loops/' || l.id
FROM loops l
JOIN projects pr ON pr.id = l.project_id
WHERE NOT EXISTS (
  SELECT 1 FROM loop_tags lt WHERE lt.loop_id = l.id
)

UNION ALL

-- 3.8 Certificate 'issued' con punch Cat A abierto en el mismo subsystem
SELECT
  'critical', 'certificate_prereqs', 'certificate', c.id, c.certificate_number, c.project_id, pr.org_id,
  'Certificado ' || c.certificate_number || ' emitido con Cat A abiertos',
  'Revisar y cerrar punches Cat A, o registrar excepción formal',
  '/projects/' || c.project_id || '/certificates/' || c.id
FROM certificates c
JOIN projects pr ON pr.id = c.project_id
WHERE c.status = 'issued'
  AND c.subsystem_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM punches pu
    WHERE pu.subsystem_id = c.subsystem_id
      AND pu.category = 'A'
      AND pu.status NOT IN ('closed','cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM certificate_punch_exceptions cpe
        WHERE cpe.certificate_id = c.id AND cpe.punch_id = pu.id
      )
  )

UNION ALL

-- 3.9 Subsystem con tags pero sin ITRs
SELECT
  'warning', 'system_completeness', 'subsystem', s.id, s.code, s.project_id, pr.org_id,
  'Subsistema ' || s.code || ' tiene tags pero 0 ITRs',
  'Generar o asignar ITRs desde templates para cubrir los tags',
  '/projects/' || s.project_id || '/explorer?subsystem=' || s.id
FROM subsystems s
JOIN projects pr ON pr.id = s.project_id
WHERE EXISTS (SELECT 1 FROM tags t WHERE t.subsystem_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM itrs i WHERE i.subsystem_id = s.id)

UNION ALL

-- 3.10 Signals sin tag ni loop (huérfanas)
SELECT
  'warning', 'system_completeness', 'signal', sg.id, sg.signal_tag, t.project_id, pr.org_id,
  'Señal ' || sg.signal_tag || ' sin loop asignado',
  'Vincular la señal a un loop o marcar como independiente',
  '/projects/' || t.project_id || '/tags/' || sg.tag_id
FROM signals sg
JOIN tags t ON t.id = sg.tag_id
JOIN projects pr ON pr.id = t.project_id
WHERE sg.loop_id IS NULL

UNION ALL

-- 3.11 ITR rechazado >= 3 veces (por conteo de eventos en domain_events)
SELECT
  'warning', 'itr_integrity', 'itr', i.id, i.itr_number, i.project_id, pr.org_id,
  'ITR ' || i.itr_number || ' rechazado ' || cnt.n || ' veces (posible problema sistemático)',
  'Revisar causa raíz: alcance, capacitación o procedimiento',
  '/projects/' || i.project_id || '/itrs/' || i.id
FROM itrs i
JOIN projects pr ON pr.id = i.project_id
JOIN (
  SELECT
    ((de.payload->'new')->>'id')::UUID AS itr_id,
    COUNT(*) AS n
  FROM domain_events de
  WHERE de.aggregate_type = 'itrs'
    AND de.event_type = 'itrs.updated'
    AND (de.payload->'new')->>'status' = 'rejected'
  GROUP BY 1
  HAVING COUNT(*) >= 3
) cnt ON cnt.itr_id = i.id;

COMMENT ON VIEW data_quality_issues IS
  'Vista UNION ALL de reglas de calidad de datos. RLS aplicada por tablas base.';


-- Resumen agregado para el dashboard (counts por severity y category)
CREATE OR REPLACE FUNCTION data_quality_summary(p_org_id UUID)
RETURNS TABLE (
  severity   TEXT,
  category   TEXT,
  count      BIGINT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    dq.severity,
    dq.category,
    COUNT(*)
  FROM data_quality_issues dq
  WHERE dq.org_id = p_org_id
    AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = p_org_id AND om.user_id = auth.uid()
    )
  GROUP BY dq.severity, dq.category
  ORDER BY dq.severity, dq.category;
$$;

REVOKE ALL ON FUNCTION data_quality_summary(UUID) FROM public;
GRANT EXECUTE ON FUNCTION data_quality_summary(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 15.4 — Helper: listar issues con paginación (para panel)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION data_quality_list(
  p_org_id     UUID,
  p_category   TEXT DEFAULT NULL,
  p_severity   TEXT DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_limit      INT  DEFAULT 200,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  severity      TEXT,
  category      TEXT,
  entity_type   TEXT,
  entity_id     UUID,
  entity_label  TEXT,
  project_id    UUID,
  description   TEXT,
  suggested_fix TEXT,
  fix_url       TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    dq.severity, dq.category, dq.entity_type, dq.entity_id, dq.entity_label,
    dq.project_id, dq.description, dq.suggested_fix, dq.fix_url
  FROM data_quality_issues dq
  WHERE dq.org_id = p_org_id
    AND (p_category IS NULL OR dq.category = p_category)
    AND (p_severity IS NULL OR dq.severity = p_severity)
    AND (p_project_id IS NULL OR dq.project_id = p_project_id)
    AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = p_org_id AND om.user_id = auth.uid()
    )
  ORDER BY
    CASE dq.severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1 ELSE 2 END,
    dq.category,
    dq.entity_label
  LIMIT p_limit OFFSET p_offset;
$$;

REVOKE ALL ON FUNCTION data_quality_list(UUID, TEXT, TEXT, UUID, INT, INT) FROM public;
GRANT EXECUTE ON FUNCTION data_quality_list(UUID, TEXT, TEXT, UUID, INT, INT) TO authenticated;


-- Grants para las vistas (RLS se aplica sobre tablas base)
GRANT SELECT ON analytics_subsystem_progress TO authenticated;
GRANT SELECT ON analytics_subsystem_velocity TO authenticated;
GRANT SELECT ON analytics_bottlenecks         TO authenticated;
GRANT SELECT ON data_quality_issues           TO authenticated;
