-- fn: public.take_mgmt_snapshot(uuid, date)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.take_mgmt_snapshot(p_project_id uuid, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid; r record; v_systems integer := 0;
  v_itr bigint := 0; v_wsum numeric := 0; v_gapp integer := 0; v_gtot integer := 0; v_kpis jsonb;
  v_tz text; v_from timestamptz; v_to timestamptz;
BEGIN
  -- S10 (D-05/D-27): el día y la ventana de 30 días se cortan en la zona del proyecto.
  v_tz := public.project_timezone(p_project_id);
  p_date := COALESCE(p_date, public.tz_today(v_tz));
  v_from := public.tz_day_start(p_date - 30, v_tz); v_to := public.tz_day_start(p_date + 1, v_tz);
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Proyecto no encontrado' USING ERRCODE = 'P0002'; END IF;

  FOR r IN SELECT * FROM public.compute_project_progress(p_project_id) LOOP
    INSERT INTO system_progress_snapshots (org_id, project_id, system_id, snapshot_date, weighted_pct, itr_total, itr_approved,
                                           gates_approved, gates_total, per_gate)
    VALUES (v_org, p_project_id, r.system_id, p_date, r.weighted_pct, r.itr_total, r.itr_approved, r.gates_approved, r.gates_total,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('gate_id', cp.gate_id, 'code', cp.gate_code, 'weight', cp.weight,
                        'itr_total', cp.itr_total, 'itr_approved', cp.itr_approved, 'pct', cp.pct, 'approved', cp.approved)
                        ORDER BY cp.gate_order, cp.gate_code)
                      FROM public.compute_system_progress(r.system_id) cp), '[]'::jsonb))
    ON CONFLICT (system_id, snapshot_date) DO UPDATE
      SET weighted_pct = EXCLUDED.weighted_pct, itr_total = EXCLUDED.itr_total, itr_approved = EXCLUDED.itr_approved,
          gates_approved = EXCLUDED.gates_approved, gates_total = EXCLUDED.gates_total, per_gate = EXCLUDED.per_gate, created_at = now();
    v_systems := v_systems + 1;
    v_itr := v_itr + r.itr_total;
    v_wsum := v_wsum + r.weighted_pct * r.itr_total;
    v_gapp := v_gapp + r.gates_approved;
    v_gtot := v_gtot + r.gates_total;
  END LOOP;

  -- KPIs calculables (ventana de 30 días hasta p_date).
  SELECT jsonb_build_object(
    'tq', (SELECT jsonb_build_object(
             'open', COUNT(*) FILTER (WHERE status IN ('draft', 'issued')),
             'answered_pending_close', COUNT(*) FILTER (WHERE status = 'answered'),
             'closed_30d', COUNT(*) FILTER (WHERE closed_at >= v_from AND closed_at < v_to),
             'answered_30d', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to),
             'on_time_30d', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to AND required_by IS NOT NULL AND (responded_at AT TIME ZONE v_tz)::date <= required_by),
             'with_due_30d', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to AND required_by IS NOT NULL),
             'avg_days_to_answer_30d', round(AVG(EXTRACT(EPOCH FROM (responded_at - issued_at)) / 86400)
                                       FILTER (WHERE responded_at >= v_from AND responded_at < v_to AND issued_at IS NOT NULL)::numeric, 1),
             'overdue', COUNT(*) FILTER (WHERE status = 'issued' AND required_by < p_date))
           FROM technical_queries WHERE project_id = p_project_id AND status <> 'cancelled'),
    'actions', (SELECT jsonb_build_object(
             'open', COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')),
             'to_verify', COUNT(*) FILTER (WHERE status = 'done'),
             'overdue', COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND due_date < p_date),
             'verified_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to),
             'on_time_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to AND due_date IS NOT NULL AND (done_at AT TIME ZONE v_tz)::date <= due_date),
             'with_due_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to AND due_date IS NOT NULL))
           FROM actions WHERE project_id = p_project_id),
    'constraints', (SELECT jsonb_build_object(
             'open', COUNT(*) FILTER (WHERE status = 'open'),
             'by_level', jsonb_build_object(
                '1', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 1),
                '2', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 2),
                '3', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 3),
                '4', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 4)),
             'avg_age_days', round(AVG(p_date - (created_at AT TIME ZONE v_tz)::date) FILTER (WHERE status = 'open')::numeric, 1),
             'overdue', COUNT(*) FILTER (WHERE status = 'open' AND need_date < p_date),
             'closed_30d', COUNT(*) FILTER (WHERE closed_at >= v_from AND closed_at < v_to))
           FROM project_constraints WHERE project_id = p_project_id),
    -- Cumplimiento del compromiso: gates aprobados en la ventana que tenían compromiso.
    'commitments', (SELECT jsonb_build_object(
             'approved_30d', COUNT(*),
             'on_time_30d', COUNT(*) FILTER (WHERE (a.approved_at AT TIME ZONE v_tz)::date <= gp.commitment_date))
           FROM system_gate_approvals a
           JOIN system_gate_plans gp ON gp.system_id = a.system_id AND gp.gate_id = a.gate_id AND gp.commitment_date IS NOT NULL
           WHERE a.project_id = p_project_id AND a.revoked_at IS NULL
             AND a.status IN ('approved', 'approved_with_conditions')
             AND a.approved_at >= v_from AND a.approved_at < v_to),
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
           WHERE t.project_id = p_project_id AND a.evaluated > 0),
    -- Completitud documental (F8, decisión 2026-10-19): As-Built/Final sobre los documentos ligados a sistemas.
    'documents', (SELECT jsonb_build_object(
             'total', COUNT(*),
             'linked', COUNT(*) FILTER (WHERE dx.linked),
             'as_built', COUNT(*) FILTER (WHERE dx.linked AND cur.status IN ('as_built', 'final')),
             'no_revision', COUNT(*) FILTER (WHERE d.current_revision_id IS NULL),
             'outdated_refs', (SELECT COUNT(*) FROM document_references dr JOIN documents d2 ON d2.id = dr.document_id
                               WHERE dr.project_id = p_project_id AND dr.revision_id <> d2.current_revision_id
                                 AND ((dr.itr_id IS NOT NULL AND EXISTS (SELECT 1 FROM itr_signatures sg WHERE sg.itr_id = dr.itr_id))
                                   OR (dr.procedure_revision_id IS NOT NULL AND EXISTS (SELECT 1 FROM procedures pr2 WHERE pr2.current_revision_id = dr.procedure_revision_id)))))
           FROM documents d
           LEFT JOIN document_revisions cur ON cur.id = d.current_revision_id
           CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM document_systems ds WHERE ds.document_id = d.id) AS linked) dx
           WHERE d.project_id = p_project_id),
    -- Readiness de vendors (F8, decisión 2026-10-19): paquetes activos sin bloqueos.
    'vendors', (SELECT jsonb_build_object(
             'planned', COUNT(*) FILTER (WHERE vp.status = 'planned'),
             'mobilized', COUNT(*) FILTER (WHERE vp.status = 'mobilized'),
             'demobilized', COUNT(*) FILTER (WHERE vp.status = 'demobilized'),
             'active', COUNT(*) FILTER (WHERE vp.status IN ('mobilized', 'demobilized')),
             'clear', COUNT(*) FILTER (WHERE vp.status IN ('mobilized', 'demobilized') AND NOT vb.bad_tests AND vb.open_findings = 0 AND NOT vb.to_decide),
             'open_findings', COALESCE(SUM(vb.open_findings), 0))
           FROM vendor_packages vp
           CROSS JOIN LATERAL (SELECT
             EXISTS (SELECT 1 FROM vendor_activities va WHERE va.package_id = vp.id AND va.result IN ('pending', 'failed')) AS bad_tests,
             (SELECT COUNT(*) FROM vendor_findings vf
                LEFT JOIN punches pu ON pu.id = vf.punch_id
                LEFT JOIN actions ac ON ac.id = vf.action_id
               WHERE vf.package_id = vp.id
                 AND (pu.status::text IN ('open', 'in_progress') OR ac.status IN ('open', 'in_progress', 'done'))) AS open_findings,
             EXISTS (SELECT 1 FROM vendor_recommendations vr WHERE vr.package_id = vp.id AND vr.status = 'proposed') AS to_decide) vb
           WHERE vp.project_id = p_project_id AND vp.status <> 'cancelled')
  ) INTO v_kpis;

  INSERT INTO mgmt_kpi_snapshots (org_id, project_id, snapshot_date, weighted_pct, itr_total, gates_approved, gates_total, kpis)
  VALUES (v_org, p_project_id, p_date, CASE WHEN v_itr > 0 THEN round(v_wsum / v_itr, 6) ELSE 0 END, v_itr, v_gapp, v_gtot, v_kpis)
  ON CONFLICT (project_id, snapshot_date) DO UPDATE
    SET weighted_pct = EXCLUDED.weighted_pct, itr_total = EXCLUDED.itr_total, gates_approved = EXCLUDED.gates_approved,
        gates_total = EXCLUDED.gates_total, kpis = EXCLUDED.kpis, created_at = now();

  RETURN jsonb_build_object('systems', v_systems, 'weighted_pct', CASE WHEN v_itr > 0 THEN round(v_wsum / v_itr, 6) ELSE 0 END);
END;
$function$;
