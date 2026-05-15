-- ══════════════════════════════════════════════════════════════
-- Stage 12 — Digital Twin: vista tag_360
-- ══════════════════════════════════════════════════════════════
-- Agrega por tag:
--   · Hierarchy: area / system / subsystem / discipline
--   · ITRs: total, aprobados, abiertos, % completitud, semáforo
--   · Punches abiertos por categoría A/B/C
--   · Certificates del subsystem (issued count, last date, summary de fases)
--   · Preservation: planes activos y próxima fecha vencimiento
--   · P&ID: hotspots count + primer drawing/doc
--   · semaforo_global: red si punch A abierto, yellow si en progreso,
--                      green si ITRs 100% y sin punches A/B, grey si sin ITRs
--
-- RLS: la vista usa SECURITY INVOKER (default PG15+). Hereda las
-- policies de tags / itrs / punches / certificates / preservation_plans
-- / pid_hotspots / pid_documents — el usuario solo ve filas de sus orgs.
--
-- Reemplaza cualquier versión previa.
-- ══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.tag_360;

CREATE OR REPLACE VIEW public.tag_360
WITH (security_invoker = true)
AS
WITH itr_agg AS (
  SELECT
    i.tag_id,
    COUNT(*)                                                          AS itr_total,
    COUNT(*) FILTER (WHERE i.status = 'approved')                     AS itr_approved,
    COUNT(*) FILTER (WHERE i.status <> 'approved')                    AS itr_open
  FROM itrs i
  WHERE i.tag_id IS NOT NULL
  GROUP BY i.tag_id
),
punch_agg AS (
  SELECT
    p.tag_id,
    COUNT(*) FILTER (WHERE p.category = 'A' AND p.status IN ('open','in_progress')) AS open_punches_a,
    COUNT(*) FILTER (WHERE p.category = 'B' AND p.status IN ('open','in_progress')) AS open_punches_b,
    COUNT(*) FILTER (WHERE p.category = 'C' AND p.status IN ('open','in_progress')) AS open_punches_c,
    COUNT(*) FILTER (WHERE                         p.status IN ('open','in_progress')) AS open_punches_total
  FROM punches p
  WHERE p.tag_id IS NOT NULL
  GROUP BY p.tag_id
),
cert_agg AS (
  SELECT
    c.subsystem_id,
    COUNT(*) FILTER (WHERE c.status = 'issued')                       AS certs_issued,
    MAX(c.issued_date) FILTER (WHERE c.status = 'issued')             AS last_cert_date,
    STRING_AGG(DISTINCT ph.code, ', ' ORDER BY ph.code)
      FILTER (WHERE c.status = 'issued')                              AS certs_summary
  FROM certificates c
  LEFT JOIN project_phases ph ON ph.id = c.phase_id
  WHERE c.subsystem_id IS NOT NULL
  GROUP BY c.subsystem_id
),
preserv_agg AS (
  SELECT
    pp.tag_id,
    COUNT(*) FILTER (WHERE pp.status = 'active')                      AS preservation_active_plans,
    MIN(pp.next_due_date) FILTER (WHERE pp.status = 'active')         AS preservation_next_due
  FROM preservation_plans pp
  GROUP BY pp.tag_id
),
hotspot_agg AS (
  SELECT
    h.tag_id,
    COUNT(*)                                                          AS pid_hotspot_count,
    (ARRAY_AGG(d.drawing_number ORDER BY h.created_at))[1]            AS first_pid_drawing,
    (ARRAY_AGG(h.pid_document_id ORDER BY h.created_at))[1]           AS first_pid_doc_id
  FROM pid_hotspots h
  JOIN pid_documents d ON d.id = h.pid_document_id
  GROUP BY h.tag_id
)
SELECT
  t.id                                                                AS tag_id,
  t.project_id,
  pr.org_id,
  t.tag_number,
  t.description,
  t.status::text                                                      AS tag_status,
  t.manufacturer,
  t.model,
  t.serial_number,
  t.preservation_required,
  t.pid_drawing,
  t.signal_type::text                                                 AS signal_type,
  t.sil_level,
  t.io_address,

  d.id                                                                AS discipline_id,
  d.code                                                              AS discipline_code,
  d.name                                                              AS discipline_name,
  d.color                                                             AS discipline_color,

  sub.id                                                              AS subsystem_id,
  sub.code                                                            AS subsystem_code,
  sub.name                                                            AS subsystem_name,
  sys.id                                                              AS system_id,
  sys.code                                                            AS system_code,
  sys.name                                                            AS system_name,
  a.id                                                                AS area_id,
  a.code                                                              AS area_code,
  a.name                                                              AS area_name,

  COALESCE(ia.itr_total, 0)::int                                      AS itr_total,
  COALESCE(ia.itr_approved, 0)::int                                   AS itr_approved,
  COALESCE(ia.itr_open, 0)::int                                       AS itr_open,
  CASE
    WHEN COALESCE(ia.itr_total, 0) = 0 THEN 0
    ELSE ROUND((ia.itr_approved::numeric / ia.itr_total::numeric) * 100)::int
  END                                                                 AS itr_pct,
  CASE
    WHEN COALESCE(ia.itr_total, 0) = 0                                THEN 'grey'
    WHEN ia.itr_approved = ia.itr_total                               THEN 'green'
    WHEN ia.itr_approved > 0                                          THEN 'yellow'
    ELSE 'grey'
  END                                                                 AS itr_semaforo,

  COALESCE(pa.open_punches_a, 0)::int                                 AS open_punches_a,
  COALESCE(pa.open_punches_b, 0)::int                                 AS open_punches_b,
  COALESCE(pa.open_punches_c, 0)::int                                 AS open_punches_c,
  COALESCE(pa.open_punches_total, 0)::int                             AS open_punches_total,

  COALESCE(ca.certs_issued, 0)::int                                   AS certs_issued,
  ca.last_cert_date,
  ca.certs_summary,

  pra.preservation_next_due,
  COALESCE(pra.preservation_active_plans, 0)::int                     AS preservation_active_plans,

  COALESCE(ha.pid_hotspot_count, 0)::int                              AS pid_hotspot_count,
  ha.first_pid_drawing,
  ha.first_pid_doc_id,

  -- Semáforo global
  CASE
    WHEN COALESCE(pa.open_punches_a, 0) > 0                           THEN 'red'
    WHEN COALESCE(ia.itr_total, 0) = 0                                THEN 'grey'
    WHEN ia.itr_approved = ia.itr_total
         AND COALESCE(pa.open_punches_b, 0) = 0                       THEN 'green'
    ELSE 'yellow'
  END                                                                 AS semaforo_global

FROM tags t
JOIN projects   pr  ON pr.id  = t.project_id
JOIN subsystems sub ON sub.id = t.subsystem_id
JOIN systems    sys ON sys.id = sub.system_id
JOIN areas      a   ON a.id   = sys.area_id
JOIN disciplines d  ON d.id   = t.discipline_id
LEFT JOIN itr_agg     ia  ON ia.tag_id       = t.id
LEFT JOIN punch_agg   pa  ON pa.tag_id       = t.id
LEFT JOIN cert_agg    ca  ON ca.subsystem_id = sub.id
LEFT JOIN preserv_agg pra ON pra.tag_id      = t.id
LEFT JOIN hotspot_agg ha  ON ha.tag_id       = t.id;

COMMENT ON VIEW public.tag_360 IS
  'Stage 12 Digital Twin — agregado 360° por tag (ITRs, punches, certs, preservation, P&ID hotspots, semáforo).';

GRANT SELECT ON public.tag_360 TO authenticated;
