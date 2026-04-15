-- ============================================================
-- CommUP Stage 15 — Analytics SQL Layer
-- Vistas materializadas + funciones para Intelligence Layer
-- ============================================================

-- ── Extensiones necesarias ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;  -- para query analytics
CREATE EXTENSION IF NOT EXISTS pg_cron;             -- para refresh programado

-- ════════════════════════════════════════════════════════════
-- 1. VISTA: systems_readiness_view
--    Base para el Prediction Engine y Bottleneck Detector
-- ════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW IF NOT EXISTS public.systems_readiness_view AS
SELECT
  s.id                                                AS system_id,
  s.system_tag,
  s.description,
  s.discipline,
  s.area,
  s.parent_system_id,
  s.planned_mc_date,
  s.planned_rfsu_date,
  s.mc_achieved_at,
  s.rfsu_achieved_at,
  CASE
    WHEN s.mc_achieved_at IS NOT NULL THEN 'achieved'
    WHEN EXISTS (
      SELECT 1 FROM punch_items pi
      WHERE pi.system_id = s.id AND pi.category = 'A' AND pi.status != 'cleared'
    ) THEN 'blocked'
    WHEN s.planned_mc_date < NOW() THEN 'overdue'
    ELSE 'in_progress'
  END                                                 AS mc_status,

  -- Contadores ITR
  COUNT(i.id) FILTER (WHERE i.id IS NOT NULL)         AS total_itrs,
  COUNT(i.id) FILTER (WHERE i.status = 'approved')    AS itrs_approved,
  COUNT(i.id) FILTER (WHERE i.status = 'rejected')    AS itrs_rejected,
  COUNT(i.id) FILTER (WHERE i.status = 'pending')     AS itrs_pending,
  COUNT(i.id) FILTER (WHERE i.status = 'submitted')   AS itrs_submitted,

  -- % completeness
  ROUND(
    100.0 * COUNT(i.id) FILTER (WHERE i.status = 'approved') /
    NULLIF(COUNT(i.id), 0)
  , 1)                                                AS mc_completion_pct,

  -- Contadores Punch
  COUNT(p.id) FILTER (WHERE p.category = 'A' AND p.status != 'cleared') AS punch_cat_a_open,
  COUNT(p.id) FILTER (WHERE p.category = 'B' AND p.status != 'cleared') AS punch_cat_b_open,
  COUNT(p.id) FILTER (WHERE p.category = 'C' AND p.status != 'cleared') AS punch_cat_c_open,
  COUNT(p.id) FILTER (WHERE p.status = 'cleared')     AS punch_cleared,

  -- Certificados
  COUNT(c.id) FILTER (WHERE c.status != 'issued')     AS certificates_pending,
  COUNT(c.id) FILTER (WHERE c.status = 'issued')      AS certificates_issued,

  -- Subsistemas
  COUNT(DISTINCT ss.id)                               AS subsystems_total,
  COUNT(DISTINCT ss.id) FILTER (WHERE ss.mc_achieved_at IS NOT NULL) AS subsystems_mc_achieved,

  -- Predicción (placeholder — llenado por el Prediction Engine via Edge Function)
  s.predicted_mc_p10,
  s.predicted_mc_p50,
  s.predicted_mc_p90,
  s.predicted_rfsu_p50,
  EXTRACT(DAY FROM (s.predicted_mc_p50 - s.planned_mc_date))::INT AS delay_days_p50,
  s.risk_score,
  CASE
    WHEN s.predicted_mc_p50 IS NULL THEN 'unknown'
    WHEN s.predicted_mc_p50 <= s.planned_mc_date AND s.risk_score < 30 THEN 'on_track'
    WHEN EXTRACT(DAY FROM (s.predicted_mc_p50 - s.planned_mc_date)) <= 7 OR s.risk_score < 50 THEN 'at_risk'
    WHEN EXTRACT(DAY FROM (s.predicted_mc_p50 - s.planned_mc_date)) <= 30 OR s.risk_score < 75 THEN 'delayed'
    ELSE 'critical'
  END                                                 AS delay_risk,

  NOW()                                               AS computed_at

FROM public.systems s
LEFT JOIN public.itrs          i  ON i.system_id = s.id
LEFT JOIN public.punch_items   p  ON p.system_id = s.id
LEFT JOIN public.certificates  c  ON c.system_id = s.id
LEFT JOIN public.systems       ss ON ss.parent_system_id = s.id
WHERE s.is_active = true
GROUP BY s.id, s.system_tag, s.description, s.discipline, s.area,
         s.parent_system_id, s.planned_mc_date, s.planned_rfsu_date,
         s.mc_achieved_at, s.rfsu_achieved_at,
         s.predicted_mc_p10, s.predicted_mc_p50, s.predicted_mc_p90,
         s.predicted_rfsu_p50, s.risk_score;

CREATE UNIQUE INDEX ON public.systems_readiness_view(system_id);
CREATE INDEX ON public.systems_readiness_view(delay_risk, risk_score DESC);
CREATE INDEX ON public.systems_readiness_view(area, discipline);

-- ════════════════════════════════════════════════════════════
-- 2. VISTA: data_quality_issues_view
--    Detecta issues de calidad directamente en SQL
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.data_quality_issues_view AS

-- 2.1 ITRs aprobados sin firma
SELECT
  'critical'                AS severity,
  'itr_integrity'           AS category,
  'itr'                     AS entity_type,
  itr_number                AS entity_label,
  'ITR aprobado sin firma de inspector' AS description,
  'Requerir firma digital antes de aprobar' AS suggested_fix,
  '/itrs/' || id || '/sign' AS fix_url,
  false                     AS auto_fixable,
  NOW()                     AS detected_at
FROM public.itrs
WHERE status = 'approved'
  AND (inspector_signature IS NULL AND approved_by IS NULL)

UNION ALL

-- 2.2 ITR rechazado 3+ veces
SELECT
  CASE WHEN rejection_count >= 5 THEN 'error' ELSE 'warning' END,
  'itr_integrity',
  'itr',
  itr_number,
  'ITR rechazado ' || rejection_count || ' veces — posible problema sistemático',
  'Revisar causa raíz: alcance, capacitación o procedimiento',
  '/itrs/' || id || '/rejection-history',
  false,
  NOW()
FROM public.itrs
WHERE rejection_count >= 3

UNION ALL

-- 2.3 Punches Cat A sin asignar
SELECT
  'critical',
  'punch_orphans',
  'punch',
  punch_number,
  'Punch Cat A ' || punch_number || ' sin ejecutor asignado. Bloquea MC',
  'Asignar ejecutor responsable de inmediato',
  '/punches/' || id || '/assign',
  false,
  NOW()
FROM public.punch_items
WHERE category = 'A'
  AND status != 'cleared'
  AND assigned_to IS NULL

UNION ALL

-- 2.4 Punches sin sistema padre
SELECT
  'error',
  'punch_orphans',
  'punch',
  COALESCE(punch_number, id::TEXT),
  'Punch sin sistema padre asignado',
  'Asociar el punch a su sistema en el WBS',
  '/punches/' || id || '/edit',
  false,
  NOW()
FROM public.punch_items
WHERE system_id IS NULL

UNION ALL

-- 2.5 ITRs sin sistema asignado
SELECT
  'error',
  'system_completeness',
  'itr',
  itr_number,
  'ITR ' || itr_number || ' sin sistema asignado',
  'Asignar el ITR a su sistema correspondiente',
  '/itrs/' || id || '/edit',
  false,
  NOW()
FROM public.itrs
WHERE system_id IS NULL

UNION ALL

-- 2.6 Loops sin tags
SELECT
  'warning',
  'tag_coverage',
  'loop',
  loop_number,
  'Loop ' || loop_number || ' sin instrumentos/tags asignados',
  'Asignar tags desde P&ID o AVEVA Smart',
  '/loops/' || id || '/tags',
  false,
  NOW()
FROM public.loops l
WHERE NOT EXISTS (
  SELECT 1 FROM public.tags t WHERE t.loop_id = l.id
)

UNION ALL

-- 2.7 Certificados MC con Punch Cat A abierto
SELECT
  'critical',
  'certificate_prereqs',
  'certificate',
  c.certificate_number,
  'Certificado MC ' || c.certificate_number || ' bloqueado: ' ||
    COUNT(p.id) || ' Punch Cat A abiertos',
  'Cerrar TODOS los Punch Cat A antes de emitir',
  '/systems/' || c.system_id || '/punches?category=A&status=open',
  false,
  NOW()
FROM public.certificates c
JOIN public.punch_items p ON p.system_id = c.system_id
WHERE c.cert_type = 'MC'
  AND c.status != 'issued'
  AND p.category = 'A'
  AND p.status != 'cleared'
GROUP BY c.id, c.certificate_number, c.system_id

UNION ALL

-- 2.8 Fechas imposibles: aprobación antes de inicio
SELECT
  'error',
  'date_logic',
  'itr',
  itr_number,
  'ITR ' || itr_number || ': aprobado (' || approved_at::DATE || ') antes de iniciar (' || started_at::DATE || ')',
  'Corregir fechas. Posible carga manual incorrecta.',
  '/itrs/' || id || '/edit',
  false,
  NOW()
FROM public.itrs
WHERE approved_at IS NOT NULL
  AND started_at IS NOT NULL
  AND approved_at < started_at;

-- ════════════════════════════════════════════════════════════
-- 3. FUNCIÓN: get_domain_events_for_system
--    Serie temporal para el Prediction Engine
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_domain_events_for_system(
  p_system_id UUID,
  p_days_back INT DEFAULT 180
)
RETURNS TABLE (
  event_id      UUID,
  system_id     UUID,
  event_type    TEXT,
  occurred_at   TIMESTAMPTZ,
  metadata      JSONB
) LANGUAGE SQL STABLE AS $$
  SELECT
    gen_random_uuid()     AS event_id,
    i.system_id,
    CASE
      WHEN i.status = 'approved' THEN 'itr_completed'
      WHEN i.status = 'rejected' THEN 'itr_rejected'
      ELSE 'itr_updated'
    END                   AS event_type,
    COALESCE(i.approved_at, i.updated_at) AS occurred_at,
    jsonb_build_object(
      'itr_id', i.id,
      'itr_number', i.itr_number,
      'discipline', i.discipline
    )                     AS metadata
  FROM public.itrs i
  WHERE i.system_id = p_system_id
    AND i.updated_at >= NOW() - (p_days_back || ' days')::INTERVAL
    AND i.status IN ('approved', 'rejected')

  UNION ALL

  SELECT
    gen_random_uuid(),
    p.system_id,
    CASE
      WHEN p.status = 'cleared' THEN 'punch_cleared'
      ELSE 'punch_raised'
    END,
    COALESCE(p.cleared_at, p.raised_at),
    jsonb_build_object(
      'punch_id', p.id,
      'category', p.category
    )
  FROM public.punch_items p
  WHERE p.system_id = p_system_id
    AND p.raised_at >= NOW() - (p_days_back || ' days')::INTERVAL

  ORDER BY occurred_at ASC;
$$;

-- ════════════════════════════════════════════════════════════
-- 4. FUNCIÓN: update_system_forecast
--    Llamada desde Edge Function con los resultados del Prediction Engine
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_system_forecast(
  p_system_id       UUID,
  p_predicted_p10   TIMESTAMPTZ,
  p_predicted_p50   TIMESTAMPTZ,
  p_predicted_p90   TIMESTAMPTZ,
  p_rfsu_p50        TIMESTAMPTZ,
  p_risk_score      INT,
  p_model_confidence NUMERIC
)
RETURNS VOID LANGUAGE SQL AS $$
  UPDATE public.systems SET
    predicted_mc_p10        = p_predicted_p10,
    predicted_mc_p50        = p_predicted_p50,
    predicted_mc_p90        = p_predicted_p90,
    predicted_rfsu_p50      = p_rfsu_p50,
    risk_score              = p_risk_score,
    model_confidence        = p_model_confidence,
    forecast_updated_at     = NOW()
  WHERE id = p_system_id;
$$;

-- ════════════════════════════════════════════════════════════
-- 5. FUNCIÓN: get_project_kpis
--    KPIs ejecutivos para el dashboard principal
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_project_kpis(p_project_id UUID)
RETURNS JSONB LANGUAGE SQL STABLE AS $$
  WITH stats AS (
    SELECT
      COUNT(*)                                          AS total_systems,
      COUNT(*) FILTER (WHERE mc_status = 'achieved')   AS mc_achieved,
      COUNT(*) FILTER (WHERE delay_risk = 'critical')  AS critical_systems,
      COUNT(*) FILTER (WHERE delay_risk = 'delayed')   AS delayed_systems,
      AVG(mc_completion_pct)                           AS avg_completion,
      SUM(punch_cat_a_open)                            AS total_punch_cat_a,
      SUM(itrs_approved)                               AS total_itrs_approved,
      SUM(total_itrs)                                  AS total_itrs,
      SUM(certificates_issued)                         AS certs_issued,
      MIN(planned_mc_date)                             AS earliest_mc,
      MAX(planned_mc_date)                             AS latest_mc
    FROM public.systems_readiness_view
  )
  SELECT jsonb_build_object(
    'total_systems',        total_systems,
    'mc_achieved',          mc_achieved,
    'mc_achieved_pct',      ROUND(100.0 * mc_achieved / NULLIF(total_systems, 0), 1),
    'critical_systems',     critical_systems,
    'delayed_systems',      delayed_systems,
    'avg_completion_pct',   ROUND(avg_completion, 1),
    'total_punch_cat_a',    total_punch_cat_a,
    'itr_completion_pct',   ROUND(100.0 * total_itrs_approved / NULLIF(total_itrs, 0), 1),
    'certs_issued',         certs_issued,
    'project_earliest_mc',  earliest_mc,
    'project_latest_mc',    latest_mc,
    'computed_at',          NOW()
  )
  FROM stats;
$$;

-- ════════════════════════════════════════════════════════════
-- 6. pg_cron: Refresh automático de vistas materializadas
-- ════════════════════════════════════════════════════════════
-- Cada hora en horario laboral (07:00 - 19:00 UTC)
SELECT cron.schedule(
  'refresh-readiness-view',
  '0 7-19 * * 1-6',    -- cada hora, L-S, 07-19 UTC
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.systems_readiness_view;$$
);

-- Refresh completo nocturno (recalcula todo)
SELECT cron.schedule(
  'full-refresh-readiness',
  '30 2 * * *',         -- 2:30 AM UTC cada día
  $$REFRESH MATERIALIZED VIEW public.systems_readiness_view;$$
);

-- ════════════════════════════════════════════════════════════
-- 7. RLS Policies para vistas analytics
-- ════════════════════════════════════════════════════════════
-- La vista materializada hereda permisos del schema
GRANT SELECT ON public.systems_readiness_view TO authenticated;
GRANT SELECT ON public.data_quality_issues_view TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_kpis TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_domain_events_for_system TO authenticated;

-- Solo service_role puede actualizar forecasts
REVOKE EXECUTE ON FUNCTION public.update_system_forecast FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_system_forecast TO service_role;

-- ════════════════════════════════════════════════════════════
-- 8. Columnas adicionales en tabla systems (forecast store)
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.systems
  ADD COLUMN IF NOT EXISTS predicted_mc_p10      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS predicted_mc_p50      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS predicted_mc_p90      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS predicted_rfsu_p50    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS risk_score            INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_confidence      NUMERIC(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_updated_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_systems_risk_score ON public.systems(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_systems_predicted_mc ON public.systems(predicted_mc_p50);
