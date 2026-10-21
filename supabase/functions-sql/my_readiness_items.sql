-- fn: public.my_readiness_items(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.my_readiness_items(p_org_id uuid)
 RETURNS TABLE(queue text, project_id uuid, entity_id uuid, ref text, title text, system_id uuid, system_code text, since timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH proj AS (
    SELECT p.id, public.tz_today(p.timezone) AS today FROM projects p WHERE p.org_id = p_org_id
  ),
  me AS (
    SELECT om.role::text AS role FROM org_members om
    WHERE om.org_id = p_org_id AND om.user_id = auth.uid() AND om.status = 'active'
      AND (om.access_expires_at IS NULL OR om.access_expires_at > now())
  ),
  gs AS (
    -- Estado guardado de S20 (lo refresca pg_cron cada minuto).
    SELECT st.project_id, st.system_id, s.code AS system_code, (g ->> 'gate_id')::uuid AS gate_id, g ->> 'code' AS gate_code,
           g ->> 'status' AS status, st.computed_at
    FROM system_gate_status st
    JOIN systems s ON s.id = st.system_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(st.gates, '[]'::jsonb)) g
    WHERE st.project_id IN (SELECT id FROM proj)
  )
  -- Gates que cumplen y que puedo aprobar (= approve_system_gate).
  SELECT 'gates_to_approve', gs.project_id, gs.gate_id, gs.gate_code, NULL::text, gs.system_id, gs.system_code, gs.computed_at
  FROM gs JOIN readiness_gates rg ON rg.id = gs.gate_id
  WHERE gs.status IN ('ready', 'ready_with_conditions')
    AND (SELECT role FROM me) = ANY (rg.approval_roles)
    AND (NOT public.capacity_designated(gs.project_id, 'commissioning') OR public.has_capacity(gs.project_id, 'commissioning'))
  UNION ALL
  -- Gates aprobados que dejaron de cumplir (o con una condición nueva): los revisa quien puede aprobar.
  SELECT 'gates_regressed', gs.project_id, gs.gate_id, gs.gate_code, gs.status, gs.system_id, gs.system_code, gs.computed_at
  FROM gs JOIN readiness_gates rg ON rg.id = gs.gate_id
  WHERE gs.status IN ('regressed', 'approved_needs_review')
    AND (SELECT role FROM me) = ANY (rg.approval_roles)
  UNION ALL
  -- Aprobaciones con una firma que me toca (= sign_system_gate) y que no firmé.
  SELECT 'gates_to_cosign', a.project_id, a.id, rg.code, NULL, a.system_id, s.code, a.approved_at
  FROM system_gate_approvals a
  JOIN readiness_gates rg ON rg.id = a.gate_id
  JOIN systems s ON s.id = a.system_id
  WHERE a.project_id IN (SELECT id FROM proj) AND a.status = 'pending_signatures' AND a.revoked_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM system_gate_signatures x WHERE x.approval_id = a.id AND x.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM unnest(rg.required_signatures) c
      WHERE NOT EXISTS (SELECT 1 FROM system_gate_signatures x WHERE x.approval_id = a.id AND x.capacity = c)
        AND CASE WHEN public.capacity_designated(a.project_id, c) THEN public.has_capacity(a.project_id, c)
                 ELSE (SELECT role FROM me) = ANY (rg.cosign_roles) END)
  UNION ALL
  -- Registros F3 (= transition_register_item): autoriza un líder+ distinto de quien propuso; verifica cualquiera
  -- que no sea cliente, distinto de quien retiró.
  SELECT 'registers_to_authorize', ri.project_id, ri.id, ri.number, ri.title, ri.system_id, s.code, ri.proposed_at
  FROM register_items ri LEFT JOIN systems s ON s.id = ri.system_id
  WHERE (SELECT role FROM me) IN ('owner', 'admin', 'architect', 'leader')
    AND ri.status = 'proposed' AND ri.proposed_by IS DISTINCT FROM auth.uid() AND ri.project_id IN (SELECT id FROM proj)
  UNION ALL
  SELECT 'registers_to_verify', ri.project_id, ri.id, ri.number, ri.title, ri.system_id, s.code, ri.removed_at
  FROM register_items ri LEFT JOIN systems s ON s.id = ri.system_id
  WHERE (SELECT role FROM me) <> 'client'
    AND ri.status = 'removed' AND ri.removed_by IS DISTINCT FROM auth.uid() AND ri.project_id IN (SELECT id FROM proj)
  UNION ALL
  -- Reportes diarios en borrador de hoy o antes (emite un líder+, = issue_daily_report).
  SELECT 'daily_reports_to_issue', dr.project_id, dr.id, dr.number, NULL, NULL, NULL, dr.created_at
  FROM daily_reports dr JOIN proj ON proj.id = dr.project_id
  WHERE (SELECT role FROM me) IN ('owner', 'admin', 'architect', 'leader')
    AND dr.status = 'draft' AND dr.report_date <= proj.today
  UNION ALL
  -- TQ respondidas que levanté o emití: las cierro yo.
  SELECT 'tq_answered', tq.project_id, tq.id, tq.number, tq.subject, tq.system_id, s.code, tq.responded_at
  FROM technical_queries tq LEFT JOIN systems s ON s.id = tq.system_id
  WHERE tq.status = 'answered' AND (tq.raised_by = auth.uid() OR tq.issued_by = auth.uid())
    AND tq.project_id IN (SELECT id FROM proj)
$function$;
