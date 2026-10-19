-- fn: public.daily_report_data(uuid, date, uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.daily_report_data(p_project_id uuid, p_date date DEFAULT CURRENT_DATE, p_area_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_proj projects%ROWTYPE; v_from timestamptz := p_date::timestamptz; v_to timestamptz := (p_date + 1)::timestamptz;
  v_now numeric; v_itr bigint; v_prev record; v_gapp integer; v_gtot integer; v_out jsonb;
BEGIN
  SELECT * INTO v_proj FROM projects WHERE id = p_project_id;
  IF v_proj.id IS NULL THEN RAISE EXCEPTION 'Proyecto no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_area_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM areas WHERE id = p_area_id AND project_id = p_project_id) THEN
    RAISE EXCEPTION 'El área no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _dr_sys (id uuid PRIMARY KEY, code text) ON COMMIT DROP;
  TRUNCATE _dr_sys;
  INSERT INTO _dr_sys SELECT s.id, s.code FROM systems s WHERE s.project_id = p_project_id AND (p_area_id IS NULL OR s.area_id = p_area_id);

  -- Avance ponderado actual vs último snapshot previo.
  SELECT COALESCE(SUM(pp.weighted_pct * pp.itr_total), 0), COALESCE(SUM(pp.itr_total), 0), COALESCE(SUM(pp.gates_approved), 0), COALESCE(SUM(pp.gates_total), 0)
    INTO v_now, v_itr, v_gapp, v_gtot
  FROM public.compute_project_progress(p_project_id) pp JOIN _dr_sys ds ON ds.id = pp.system_id;
  SELECT NULL::date AS snapshot_date, NULL::numeric AS weighted_pct INTO v_prev;
  IF p_area_id IS NULL THEN
    SELECT snapshot_date, weighted_pct INTO v_prev FROM mgmt_kpi_snapshots
     WHERE project_id = p_project_id AND snapshot_date < p_date ORDER BY snapshot_date DESC LIMIT 1;
  END IF;

  v_out := jsonb_build_object(
    'date', p_date,
    'project', jsonb_build_object('code', v_proj.code, 'name', v_proj.name),
    'area', (SELECT jsonb_build_object('code', a.code, 'name', a.name) FROM areas a WHERE a.id = p_area_id),
    'progress', jsonb_build_object(
      'weighted_pct', CASE WHEN v_itr > 0 THEN round(v_now / v_itr, 4) ELSE 0 END,
      'prev_pct', v_prev.weighted_pct, 'prev_date', v_prev.snapshot_date,
      'gates_approved', v_gapp, 'gates_total', v_gtot),
    'itrs', jsonb_build_object(
      'completed_today', (SELECT COUNT(*) FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
                           WHERE i.project_id = p_project_id AND i.completed_date = p_date),
      'approved_today', COALESCE((SELECT jsonb_agg(x ORDER BY x ->> 'system', x ->> 'number') FROM (
          SELECT jsonb_build_object('number', i.itr_number, 'tag', t.tag_number, 'system', ds.code) AS x
          FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
          LEFT JOIN tags t ON t.id = i.tag_id
          WHERE i.project_id = p_project_id AND i.status = 'approved'
            AND (SELECT MAX(sg.signed_at) FROM itr_signatures sg WHERE sg.itr_id = i.id) >= v_from
            AND (SELECT MAX(sg.signed_at) FROM itr_signatures sg WHERE sg.itr_id = i.id) < v_to
          LIMIT 30) q), '[]'::jsonb),
      'in_progress', (SELECT COUNT(*) FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
                       WHERE i.project_id = p_project_id AND i.status = 'in_progress')),
    'punches', jsonb_build_object(
      'raised_today', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('number', p.punch_number, 'category', p.category, 'description', left(p.description, 160),
                                    'tag', t.tag_number, 'system', ds.code) AS x
          FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
          LEFT JOIN tags t ON t.id = p.tag_id
          WHERE p.project_id = p_project_id AND p.created_at >= v_from AND p.created_at < v_to
          ORDER BY p.category, p.punch_number LIMIT 30) q), '[]'::jsonb),
      'closed_today', (SELECT COUNT(*) FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
                        WHERE p.project_id = p_project_id AND p.closed_date = p_date),
      'open_a', (SELECT COUNT(*) FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
                  WHERE p.project_id = p_project_id AND p.category = 'A' AND p.status IN ('open', 'in_progress')),
      'open_b', (SELECT COUNT(*) FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
                  WHERE p.project_id = p_project_id AND p.category = 'B' AND p.status IN ('open', 'in_progress'))),
    'gates', jsonb_build_object(
      'approved_today', COALESCE((SELECT jsonb_agg(jsonb_build_object('system', ds.code, 'gate', rg.code, 'status', a.status) ORDER BY ds.code, rg.order_index)
          FROM system_gate_approvals a JOIN _dr_sys ds ON ds.id = a.system_id JOIN readiness_gates rg ON rg.id = a.gate_id
          WHERE a.project_id = p_project_id AND a.revoked_at IS NULL AND a.approved_at >= v_from AND a.approved_at < v_to), '[]'::jsonb),
      'regressed', COALESCE((SELECT jsonb_agg(jsonb_build_object('system', pg.system_code, 'gate', g ->> 'code'))
          FROM public.compute_project_gates(p_project_id) pg JOIN _dr_sys ds ON ds.id = pg.system_id,
               jsonb_array_elements(pg.gates) g
          WHERE g ->> 'status' = 'regressed'), '[]'::jsonb)),
    'constraints', jsonb_build_object(
      'open_by_level', (SELECT jsonb_build_object(
            '1', COUNT(*) FILTER (WHERE escalation_level = 1), '2', COUNT(*) FILTER (WHERE escalation_level = 2),
            '3', COUNT(*) FILTER (WHERE escalation_level = 3), '4', COUNT(*) FILTER (WHERE escalation_level = 4))
          FROM project_constraints c JOIN _dr_sys ds ON ds.id = c.system_id WHERE c.project_id = p_project_id AND c.status = 'open'),
      'overdue', (SELECT COUNT(*) FROM project_constraints c JOIN _dr_sys ds ON ds.id = c.system_id
                   WHERE c.project_id = p_project_id AND c.status = 'open' AND c.need_date < p_date),
      'new_today', COALESCE((SELECT jsonb_agg(jsonb_build_object('number', c.number, 'title', c.title, 'system', ds.code, 'level', c.escalation_level, 'need_date', c.need_date) ORDER BY c.number)
          FROM project_constraints c JOIN _dr_sys ds ON ds.id = c.system_id
          WHERE c.project_id = p_project_id AND c.created_at >= v_from AND c.created_at < v_to), '[]'::jsonb),
      'escalated_today', COALESCE((SELECT jsonb_agg(jsonb_build_object('number', c.number, 'title', c.title, 'system', ds.code, 'from', e.from_value, 'to', e.to_value, 'reason', e.comment) ORDER BY c.number)
          FROM mgmt_events e JOIN project_constraints c ON c.id = e.entity_id JOIN _dr_sys ds ON ds.id = c.system_id
          WHERE e.project_id = p_project_id AND e.entity_kind = 'constraint' AND e.action = 'escalated' AND e.created_at >= v_from AND e.created_at < v_to), '[]'::jsonb),
      'open_high', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('number', c.number, 'title', c.title, 'system', ds.code, 'level', c.escalation_level, 'need_date', c.need_date,
                                    'impact', c.impact_kind, 'recovery', left(c.recovery_plan, 200)) AS x
          FROM project_constraints c JOIN _dr_sys ds ON ds.id = c.system_id
          WHERE c.project_id = p_project_id AND c.status = 'open' AND (c.escalation_level >= 3 OR c.need_date < p_date)
          ORDER BY c.escalation_level DESC, c.need_date LIMIT 30) q), '[]'::jsonb)),
    'actions', jsonb_build_object(
      'open', (SELECT COUNT(*) FROM actions a WHERE a.project_id = p_project_id AND a.status IN ('open', 'in_progress')
                AND (p_area_id IS NULL OR a.system_id IN (SELECT id FROM _dr_sys))),
      'verified_today', (SELECT COUNT(*) FROM actions a WHERE a.project_id = p_project_id AND a.verified_at >= v_from AND a.verified_at < v_to
                          AND (p_area_id IS NULL OR a.system_id IN (SELECT id FROM _dr_sys))),
      'overdue', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('number', a.number, 'title', a.title, 'due_date', a.due_date, 'priority', a.priority,
                                    'system', (SELECT code FROM systems WHERE id = a.system_id)) AS x
          FROM actions a WHERE a.project_id = p_project_id AND a.status IN ('open', 'in_progress') AND a.due_date < p_date
            AND (p_area_id IS NULL OR a.system_id IN (SELECT id FROM _dr_sys))
          ORDER BY a.due_date, a.number LIMIT 30) q), '[]'::jsonb)),
    'tqs', (SELECT jsonb_build_object(
          'issued_today', COUNT(*) FILTER (WHERE issued_at >= v_from AND issued_at < v_to),
          'answered_today', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to),
          'overdue', COUNT(*) FILTER (WHERE status = 'issued' AND required_by < p_date),
          'design_changes_today', COUNT(*) FILTER (WHERE design_change AND responded_at >= v_from AND responded_at < v_to))
        FROM technical_queries q WHERE q.project_id = p_project_id AND (p_area_id IS NULL OR q.system_id IN (SELECT id FROM _dr_sys))),
    'registers_in_field', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('number', ri.number, 'kind', ri.kind, 'status', ri.status, 'title', ri.title,
                                    'system', (SELECT code FROM systems WHERE id = ri.system_id)) AS x
          FROM register_items ri WHERE ri.project_id = p_project_id AND ri.status IN ('active', 'removed')
            AND (p_area_id IS NULL OR ri.system_id IN (SELECT id FROM _dr_sys))
          ORDER BY ri.kind, ri.number LIMIT 30) q), '[]'::jsonb),
    'lookahead_7d', COALESCE((SELECT jsonb_agg(x ORDER BY x ->> 'date', x ->> 'ref') FROM (
          SELECT jsonb_build_object('kind', 'gate', 'ref', rg.code, 'title', rg.name, 'system', ds.code, 'date', gp.commitment_date) AS x
          FROM system_gate_plans gp JOIN _dr_sys ds ON ds.id = gp.system_id JOIN readiness_gates rg ON rg.id = gp.gate_id
          WHERE gp.project_id = p_project_id AND gp.commitment_date BETWEEN p_date AND p_date + 7
            AND NOT EXISTS (SELECT 1 FROM system_gate_approvals a WHERE a.system_id = gp.system_id AND a.gate_id = gp.gate_id AND a.revoked_at IS NULL)
          UNION ALL
          SELECT jsonb_build_object('kind', 'constraint', 'ref', c.number, 'title', c.title, 'system', ds.code, 'date', c.need_date)
          FROM project_constraints c JOIN _dr_sys ds ON ds.id = c.system_id
          WHERE c.project_id = p_project_id AND c.status = 'open' AND c.need_date BETWEEN p_date AND p_date + 7
          UNION ALL
          SELECT jsonb_build_object('kind', 'action', 'ref', a.number, 'title', a.title, 'system', (SELECT code FROM systems WHERE id = a.system_id), 'date', a.due_date)
          FROM actions a WHERE a.project_id = p_project_id AND a.status IN ('open', 'in_progress') AND a.due_date BETWEEN p_date AND p_date + 7
            AND (p_area_id IS NULL OR a.system_id IN (SELECT id FROM _dr_sys))
          LIMIT 60) q), '[]'::jsonb),
    -- F6-S2: hitos y eventos de arranque del día (no anulados), con sus parámetros principales.
    'startup_events_today', COALESCE((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at') FROM (
          SELECT jsonb_build_object('number', ev.number, 'kind', ev.kind, 'code', COALESCE(ev.milestone, ev.category), 'title', ev.title,
                   'system', ds.code, 'occurred_at', ev.occurred_at, 'status', ev.status,
                   'params', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', pr.label, 'value', COALESCE(pr.value::text, pr.value_text), 'unit', pr.unit))
                                       FROM (SELECT * FROM startup_event_params WHERE event_id = ev.id AND source <> 'iiot_missing' ORDER BY created_at LIMIT 4) pr), '[]'::jsonb)) AS x
          FROM startup_events ev JOIN _dr_sys ds ON ds.id = ev.system_id
          WHERE ev.project_id = p_project_id AND ev.status <> 'voided' AND ev.occurred_at >= v_from AND ev.occurred_at < v_to
          LIMIT 30) q), '[]'::jsonb),
    -- F7: intentos de prueba de desempeño cerrados o con resultado del día, y certificados aceptados.
    'performance_today', COALESCE((SELECT jsonb_agg(x ORDER BY x ->> 'at') FROM (
          SELECT jsonb_build_object('kind', 'run', 'number', pr.number, 'title', pt.title, 'system', ds.code,
                   'status', pr.status, 'result', pr.result, 'early_close', pr.early_close, 'at', COALESCE(pr.result_at, pr.closed_at)) AS x
          FROM performance_runs pr JOIN performance_tests pt ON pt.id = pr.test_id JOIN _dr_sys ds ON ds.id = pt.primary_system_id
          WHERE pr.project_id = p_project_id
            AND ((pr.closed_at >= v_from AND pr.closed_at < v_to) OR (pr.result_at >= v_from AND pr.result_at < v_to))
          UNION ALL
          SELECT jsonb_build_object('kind', 'certificate', 'number', pc.number, 'title', pt.title, 'system', ds.code,
                   'status', pc.status, 'at', GREATEST(pc.operations_signed_at, pc.client_signed_at))
          FROM performance_certificates pc JOIN performance_tests pt ON pt.id = pc.test_id JOIN _dr_sys ds ON ds.id = pc.system_id
          WHERE pc.project_id = p_project_id AND pc.status = 'accepted'
            AND GREATEST(pc.operations_signed_at, pc.client_signed_at) >= v_from AND GREATEST(pc.operations_signed_at, pc.client_signed_at) < v_to
          LIMIT 30) q), '[]'::jsonb)
  );
  RETURN v_out;
END;
$function$;
