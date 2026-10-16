-- Fase 5 del plan readiness, sesión 3 — reporte diario y relevo de turno (2026-10-16, decisiones de Luis, doc §11.17–23):
--   daily_reports     RD-<proyecto>-AAAAMMDD[-Rn], uno por proyecto y día. `data` lo arma SIEMPRE la BD
--                     (daily_report_data; nunca viene del cliente) y queda congelado; 5 secciones editables;
--                     ai_draft = propuesta de Claude (no pisa lo editado). Emitir (líderes+) = inmutable + sha256.
--                     Corregir = revisión R(n+1); al emitirla, la anterior queda superseded. El PDF se regenera
--                     desde los datos congelados (sin storage).
--   shift_handovers   REL-0001. Lo abre y entrega cualquier rol salvo client; el snapshot (registros F3 en
--                     campo, ITR en curso, punch A, restricciones, acciones vencidas) se toma en SQL al abrir y al
--                     entregar. Recibe otra persona (no client); al aceptar queda inmutable + sha256.
--   my_work_counts    + handovers_to_receive.

-- ── 1. Tablas ────────────────────────────────────────────────────────────
CREATE TABLE public.daily_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date      date NOT NULL,
  revision         integer NOT NULL DEFAULT 0,
  number           text NOT NULL,
  area_id          uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'draft',
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_at          timestamptz NOT NULL DEFAULT now(),
  summary          text,
  key_events       text,
  issues           text,
  constraints_text text,
  next_day_plan    text,
  ai_draft         jsonb,
  ai_model         text,
  ai_generated_at  timestamptz,
  revision_reason  text,
  supersedes_id    uuid REFERENCES public.daily_reports(id) ON DELETE SET NULL,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  issued_by        uuid,
  issued_at        timestamptz,
  content_hash     text,
  CONSTRAINT daily_reports_status_check CHECK (status IN ('draft', 'issued', 'superseded')),
  CONSTRAINT daily_reports_revision_check CHECK (revision >= 0),
  CONSTRAINT daily_reports_uq UNIQUE (project_id, report_date, revision)
);
CREATE INDEX daily_reports_project_date_idx ON public.daily_reports (project_id, report_date DESC);

CREATE TABLE public.shift_handovers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq              integer NOT NULL,
  number           text NOT NULL,
  shift_date       date NOT NULL,
  shift_label      text NOT NULL DEFAULT 'day',
  status           text NOT NULL DEFAULT 'draft',
  snapshot         jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_at      timestamptz NOT NULL DEFAULT now(),
  pending_items    text,
  safety_notes     text,
  opened_by        uuid,
  opened_at        timestamptz NOT NULL DEFAULT now(),
  handed_by        uuid,
  handed_at        timestamptz,
  received_by      uuid,
  received_at      timestamptz,
  receiver_comment text,
  content_hash     text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_handovers_label_check CHECK (shift_label IN ('day', 'night', 'other')),
  CONSTRAINT shift_handovers_status_check CHECK (status IN ('draft', 'handed_over', 'accepted')),
  CONSTRAINT shift_handovers_number_uq UNIQUE (project_id, number)
);
CREATE INDEX shift_handovers_project_idx ON public.shift_handovers (project_id, shift_date DESC);
CREATE INDEX shift_handovers_pending_idx ON public.shift_handovers (project_id) WHERE status = 'handed_over';

ALTER TABLE public.daily_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_handovers ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_reports_select ON public.daily_reports FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY shift_handovers_select ON public.shift_handovers FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));

-- ── 2. Datos del día (todo en SQL; listas acotadas a 30) ────────────────
CREATE OR REPLACE FUNCTION public.daily_report_data(p_project_id uuid, p_date date DEFAULT current_date, p_area_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER  -- VOLATILE: usa una tabla temporal para el filtro de sistemas
SET search_path TO 'public', 'pg_temp'
AS $fn$
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
          LIMIT 60) q), '[]'::jsonb)
  );
  RETURN v_out;
END;
$fn$;

-- Snapshot del relevo: lo que está en campo ahora mismo (proyecto completo).
CREATE OR REPLACE FUNCTION public.handover_snapshot(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT jsonb_build_object(
    'registers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ri.id, 'number', ri.number, 'kind', ri.kind, 'status', ri.status, 'title', ri.title,
                                    'system', (SELECT code FROM systems WHERE id = ri.system_id)) ORDER BY ri.kind, ri.number)
                          FROM register_items ri WHERE ri.project_id = p_project_id AND ri.status IN ('active', 'removed')), '[]'::jsonb),
    'itrs_in_progress', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('id', i.id, 'number', i.itr_number, 'tag', t.tag_number, 'progress', i.progress_pct) AS x
          FROM itrs i LEFT JOIN tags t ON t.id = i.tag_id
          WHERE i.project_id = p_project_id AND i.status = 'in_progress' ORDER BY i.itr_number LIMIT 50) q), '[]'::jsonb),
    'itrs_in_progress_total', (SELECT COUNT(*) FROM itrs WHERE project_id = p_project_id AND status = 'in_progress'),
    'punches_a', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('id', p.id, 'number', p.punch_number, 'description', left(p.description, 160), 'tag', t.tag_number) AS x
          FROM punches p LEFT JOIN tags t ON t.id = p.tag_id
          WHERE p.project_id = p_project_id AND p.category = 'A' AND p.status IN ('open', 'in_progress') ORDER BY p.punch_number LIMIT 50) q), '[]'::jsonb),
    'constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'number', c.number, 'title', c.title, 'level', c.escalation_level,
                                    'need_date', c.need_date, 'system', s.code) ORDER BY c.escalation_level DESC, c.need_date)
                          FROM project_constraints c JOIN systems s ON s.id = c.system_id
                          WHERE c.project_id = p_project_id AND c.status = 'open'), '[]'::jsonb),
    'actions_overdue', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('id', a.id, 'number', a.number, 'title', a.title, 'due_date', a.due_date) AS x
          FROM actions a WHERE a.project_id = p_project_id AND a.status IN ('open', 'in_progress') AND a.due_date < current_date
          ORDER BY a.due_date LIMIT 50) q), '[]'::jsonb),
    'taken_at', now()
  );
$fn$;

-- ── 3. Reporte diario ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.daily_report_hash(r public.daily_reports)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'number', r.number, 'date', r.report_date, 'data', r.data, 'summary', r.summary, 'key_events', r.key_events,
    'issues', r.issues, 'constraints', r.constraints_text, 'next_day_plan', r.next_day_plan)::text, 'UTF8')), 'hex');
$fn$;

-- Crea (o devuelve y refresca) el borrador del día. Si ya hay uno emitido, hay que revisarlo.
CREATE OR REPLACE FUNCTION public.create_daily_report_draft(p_project_id uuid, p_date date DEFAULT current_date, p_area_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_proj projects%ROWTYPE; v_id uuid; v_status text;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_date IS NULL OR p_date > current_date + 1 THEN RAISE EXCEPTION 'Fecha de reporte no válida' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_proj FROM projects WHERE id = p_project_id;
  PERFORM pg_advisory_xact_lock(hashtext('daily_reports:' || p_project_id::text || ':' || p_date::text));

  SELECT id, status INTO v_id, v_status FROM daily_reports
   WHERE project_id = p_project_id AND report_date = p_date ORDER BY revision DESC LIMIT 1;
  IF v_id IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'El reporte del % ya fue emitido: crea una revisión para corregirlo', p_date USING ERRCODE = 'P0001';
  END IF;
  IF v_id IS NOT NULL THEN
    UPDATE daily_reports SET area_id = p_area_id, data = public.daily_report_data(p_project_id, p_date, p_area_id), data_at = now(),
           updated_by = auth.uid(), updated_at = now() WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO daily_reports (org_id, project_id, report_date, revision, number, area_id, data, created_by, updated_by)
  VALUES (v_proj.org_id, p_project_id, p_date, 0, 'RD-' || v_proj.code || '-' || to_char(p_date, 'YYYYMMDD'), p_area_id,
          public.daily_report_data(p_project_id, p_date, p_area_id), auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- Vuelve a tomar la foto de datos (solo borrador).
CREATE OR REPLACE FUNCTION public.refresh_daily_report_data(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r daily_reports%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM daily_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'El reporte % ya fue emitido', r.number USING ERRCODE = 'P0001'; END IF;
  UPDATE daily_reports SET data = public.daily_report_data(r.project_id, r.report_date, r.area_id), data_at = now(),
         updated_by = auth.uid(), updated_at = now() WHERE id = p_report_id;
END;
$fn$;

-- Guarda la propuesta de la IA y la copia solo a las secciones vacías (nunca pisa lo editado).
CREATE OR REPLACE FUNCTION public.set_daily_report_ai_draft(p_report_id uuid, p_draft jsonb, p_model text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r daily_reports%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM daily_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'El reporte % ya fue emitido', r.number USING ERRCODE = 'P0001'; END IF;
  IF p_draft IS NULL OR jsonb_typeof(p_draft) <> 'object' THEN RAISE EXCEPTION 'Borrador no válido' USING ERRCODE = '22023'; END IF;
  UPDATE daily_reports SET
    ai_draft = p_draft, ai_model = left(p_model, 60), ai_generated_at = now(),
    summary          = COALESCE(public.mgmt_text(summary, 8000),          public.mgmt_text(p_draft ->> 'summary', 8000)),
    key_events       = COALESCE(public.mgmt_text(key_events, 8000),       public.mgmt_text(p_draft ->> 'key_events', 8000)),
    issues           = COALESCE(public.mgmt_text(issues, 8000),           public.mgmt_text(p_draft ->> 'issues', 8000)),
    constraints_text = COALESCE(public.mgmt_text(constraints_text, 8000), public.mgmt_text(p_draft ->> 'constraints', 8000)),
    next_day_plan    = COALESCE(public.mgmt_text(next_day_plan, 8000),    public.mgmt_text(p_draft ->> 'next_day_plan', 8000)),
    updated_by = auth.uid(), updated_at = now()
  WHERE id = p_report_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_daily_report_sections(p_report_id uuid, p_sections jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r daily_reports%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM daily_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'El reporte % ya fue emitido y no se puede editar', r.number USING ERRCODE = 'P0001'; END IF;
  IF p_sections IS NULL OR jsonb_typeof(p_sections) <> 'object' THEN RAISE EXCEPTION 'Secciones no válidas' USING ERRCODE = '22023'; END IF;
  UPDATE daily_reports SET
    summary          = CASE WHEN p_sections ? 'summary'       THEN public.mgmt_text(p_sections ->> 'summary', 8000)       ELSE summary END,
    key_events       = CASE WHEN p_sections ? 'key_events'    THEN public.mgmt_text(p_sections ->> 'key_events', 8000)    ELSE key_events END,
    issues           = CASE WHEN p_sections ? 'issues'        THEN public.mgmt_text(p_sections ->> 'issues', 8000)        ELSE issues END,
    constraints_text = CASE WHEN p_sections ? 'constraints'   THEN public.mgmt_text(p_sections ->> 'constraints', 8000)   ELSE constraints_text END,
    next_day_plan    = CASE WHEN p_sections ? 'next_day_plan' THEN public.mgmt_text(p_sections ->> 'next_day_plan', 8000) ELSE next_day_plan END,
    updated_by = auth.uid(), updated_at = now()
  WHERE id = p_report_id;
END;
$fn$;

-- Emitir: líderes o superiores; exige resumen; congela con hash. Una revisión reemplaza a la anterior.
CREATE OR REPLACE FUNCTION public.issue_daily_report(p_report_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r daily_reports%ROWTYPE; v_role text; v_hash text;
BEGIN
  SELECT * INTO r FROM daily_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores emiten el reporte diario' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'El reporte % ya fue emitido', r.number USING ERRCODE = 'P0001'; END IF;
  IF public.mgmt_text(r.summary) IS NULL THEN RAISE EXCEPTION 'El resumen es obligatorio para emitir' USING ERRCODE = '22023'; END IF;

  UPDATE daily_reports SET status = 'issued', issued_by = auth.uid(), issued_at = now(), updated_at = now() WHERE id = p_report_id
  RETURNING * INTO r;
  v_hash := public.daily_report_hash(r);
  UPDATE daily_reports SET content_hash = v_hash WHERE id = p_report_id;
  IF r.supersedes_id IS NOT NULL THEN
    UPDATE daily_reports SET status = 'superseded' WHERE id = r.supersedes_id AND status = 'issued';
  END IF;
  RETURN v_hash;
END;
$fn$;

-- Revisión: copia datos y secciones del emitido vigente a un borrador R(n+1).
CREATE OR REPLACE FUNCTION public.revise_daily_report(p_report_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r daily_reports%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000); v_id uuid; v_base text;
BEGIN
  SELECT * INTO r FROM daily_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores revisan el reporte diario' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'issued' THEN RAISE EXCEPTION 'Solo se revisa el reporte emitido vigente' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM daily_reports WHERE project_id = r.project_id AND report_date = r.report_date AND revision > r.revision) THEN
    RAISE EXCEPTION 'Ya existe una revisión posterior de %', r.number USING ERRCODE = 'P0001';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la revisión' USING ERRCODE = '22023'; END IF;
  v_base := regexp_replace(r.number, '-R\d+$', '');
  INSERT INTO daily_reports (org_id, project_id, report_date, revision, number, area_id, data, data_at, summary, key_events, issues,
                             constraints_text, next_day_plan, ai_draft, ai_model, ai_generated_at, revision_reason, supersedes_id, created_by, updated_by)
  VALUES (r.org_id, r.project_id, r.report_date, r.revision + 1, v_base || '-R' || (r.revision + 1), r.area_id, r.data, r.data_at, r.summary,
          r.key_events, r.issues, r.constraints_text, r.next_day_plan, r.ai_draft, r.ai_model, r.ai_generated_at, v_reason, r.id, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- Borrar solo borradores (quien lo creó u owner/admin).
CREATE OR REPLACE FUNCTION public.delete_daily_report_draft(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r daily_reports%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM daily_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF v_role IS NULL OR NOT (r.created_by = auth.uid() OR v_role IN ('owner', 'admin')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Solo se borran borradores' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM daily_reports WHERE id = p_report_id;
END;
$fn$;

-- ── 4. Relevo de turno ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handover_hash(h public.shift_handovers)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'number', h.number, 'date', h.shift_date, 'label', h.shift_label, 'snapshot', h.snapshot, 'pending', h.pending_items,
    'safety', h.safety_notes, 'handed_by', h.handed_by, 'handed_at', h.handed_at, 'received_by', h.received_by,
    'received_at', h.received_at, 'comment', h.receiver_comment)::text, 'UTF8')), 'hex');
$fn$;

CREATE OR REPLACE FUNCTION public.open_shift_handover(p_project_id uuid, p_shift_label text DEFAULT 'day', p_shift_date date DEFAULT current_date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_shift_date IS NULL OR p_shift_date > current_date + 1 THEN RAISE EXCEPTION 'Fecha de turno no válida' USING ERRCODE = '22023'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  PERFORM pg_advisory_xact_lock(hashtext('shift_handovers:' || p_project_id::text));
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq FROM shift_handovers WHERE project_id = p_project_id;
  INSERT INTO shift_handovers (org_id, project_id, seq, number, shift_date, shift_label, snapshot, opened_by)
  VALUES (v_org, p_project_id, v_seq, 'REL-' || lpad(v_seq::text, 4, '0'), p_shift_date, COALESCE(p_shift_label, 'day'),
          public.handover_snapshot(p_project_id), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_shift_handover(p_handover_id uuid, p_pending text, p_safety text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE h shift_handovers%ROWTYPE;
BEGIN
  SELECT * INTO h FROM shift_handovers WHERE id = p_handover_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relevo no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR h.opened_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Solo quien abrió el relevo lo edita' USING ERRCODE = '42501'; END IF;
  IF h.status <> 'draft' THEN RAISE EXCEPTION 'El relevo % ya fue entregado', h.number USING ERRCODE = 'P0001'; END IF;
  UPDATE shift_handovers SET pending_items = public.mgmt_text(p_pending, 8000), safety_notes = public.mgmt_text(p_safety, 8000), updated_at = now()
   WHERE id = p_handover_id;
END;
$fn$;

-- Entregar: quien lo abrió; retoma la foto del campo en ese momento.
CREATE OR REPLACE FUNCTION public.hand_over_shift(p_handover_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE h shift_handovers%ROWTYPE;
BEGIN
  SELECT * INTO h FROM shift_handovers WHERE id = p_handover_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relevo no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR h.opened_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Solo quien abrió el relevo lo entrega' USING ERRCODE = '42501'; END IF;
  IF h.status <> 'draft' THEN RAISE EXCEPTION 'El relevo % ya fue entregado', h.number USING ERRCODE = 'P0001'; END IF;
  UPDATE shift_handovers SET status = 'handed_over', snapshot = public.handover_snapshot(h.project_id), snapshot_at = now(),
         handed_by = auth.uid(), handed_at = now(), updated_at = now() WHERE id = p_handover_id;
END;
$fn$;

-- Recibir: otra persona, no client. Congela con hash.
CREATE OR REPLACE FUNCTION public.accept_shift_handover(p_handover_id uuid, p_comment text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE h shift_handovers%ROWTYPE; v_role text; v_hash text;
BEGIN
  SELECT * INTO h FROM shift_handovers WHERE id = p_handover_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relevo no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(h.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF h.status <> 'handed_over' THEN RAISE EXCEPTION 'El relevo % no está entregado', h.number USING ERRCODE = 'P0001'; END IF;
  IF h.handed_by = auth.uid() THEN RAISE EXCEPTION 'Quien recibe el turno debe ser otra persona' USING ERRCODE = '42501'; END IF;
  UPDATE shift_handovers SET status = 'accepted', received_by = auth.uid(), received_at = now(),
         receiver_comment = public.mgmt_text(p_comment, 4000), updated_at = now()
   WHERE id = p_handover_id RETURNING * INTO h;
  v_hash := public.handover_hash(h);
  UPDATE shift_handovers SET content_hash = v_hash WHERE id = p_handover_id;
  RETURN v_hash;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_shift_handover_draft(p_handover_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE h shift_handovers%ROWTYPE;
BEGIN
  SELECT * INTO h FROM shift_handovers WHERE id = p_handover_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relevo no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR h.opened_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF h.status <> 'draft' THEN RAISE EXCEPTION 'Solo se borran borradores' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM shift_handovers WHERE id = p_handover_id;
END;
$fn$;

-- ── 5. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.daily_report_data(uuid, date, uuid)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handover_snapshot(uuid)                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_report_hash(public.daily_reports)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handover_hash(public.shift_handovers)         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_daily_report_draft(uuid, date, uuid)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refresh_daily_report_data(uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_daily_report_ai_draft(uuid, jsonb, text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_daily_report_sections(uuid, jsonb)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.issue_daily_report(uuid)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revise_daily_report(uuid, text)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_daily_report_draft(uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.open_shift_handover(uuid, text, date)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_shift_handover(uuid, text, text)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hand_over_shift(uuid)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_shift_handover(uuid, text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_shift_handover_draft(uuid)             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_report_data(uuid, date, uuid)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_daily_report_draft(uuid, date, uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_daily_report_data(uuid)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_daily_report_ai_draft(uuid, jsonb, text)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_daily_report_sections(uuid, jsonb)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_daily_report(uuid)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revise_daily_report(uuid, text)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_daily_report_draft(uuid)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_shift_handover(uuid, text, date)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_shift_handover(uuid, text, text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hand_over_shift(uuid)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_shift_handover(uuid, text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_shift_handover_draft(uuid)              TO authenticated, service_role;

-- ── 6. Mi trabajo: relevos por recibir ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_work_counts(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with proj as (
    select id from projects where org_id = p_org_id
  ),
  me as (
    select role::text as role from org_members where org_id = p_org_id and user_id = auth.uid()
  )
  select jsonb_build_object(
    'itrs_execute', (
      select count(distinct i.id)
      from itr_assignments a
      join itrs i on i.id = a.itr_id
      where a.user_id = auth.uid()
        and a.role = 'executor'
        and i.status in ('not_started', 'in_progress')
        and i.project_id in (select id from proj)
    ),
    'itrs_review', (
      select count(distinct i.id)
      from itr_assignments a
      join itrs i on i.id = a.itr_id
      where a.user_id = auth.uid()
        and a.role in ('supervisor', 'client')
        and i.status = 'completed'
        and i.project_id in (select id from proj)
        and not exists (
          select 1 from itr_signatures s where s.itr_id = i.id and s.role = a.role
        )
    ),
    'punches', (
      select count(*)
      from punches p
      where p.assigned_to = auth.uid()
        and p.status in ('open', 'in_progress')
        and p.resolved_at is null
        and p.project_id in (select id from proj)
    ),
    'punches_verify', (
      select count(*)
      from punches p
      where p.status = 'in_progress'
        and p.resolved_at is not null
        and p.resolved_by is distinct from auth.uid()
        and p.project_id in (select id from proj)
    ),
    'punches_review', (
      select case when (select role from me) in ('owner', 'admin', 'architect', 'leader') then (
        select count(*)
        from punches p
        where p.status in ('open', 'in_progress')
          and p.category_reviewed_at is null
          and p.raised_by is distinct from auth.uid()
          and p.project_id in (select id from proj)
      ) else 0 end
    ),
    'plan_items', (
      select count(*)
      from work_plan_items wi
      join work_plans wp on wp.id = wi.work_plan_id
      where wi.assigned_to = auth.uid()
        and wi.status in ('not_started', 'in_progress')
        and wp.status in ('published', 'in_progress')
        and wp.plan_date <= current_date
        and wp.project_id in (select id from proj)
    ),
    'signatures', (
      select count(*)
      from certificates c
      where c.status = 'issued'
        and c.project_id in (select id from proj)
        and not exists (
          select 1 from certificate_signatures cs
          where cs.certificate_id = c.id and cs.role = 'completion'
        )
    ),
    'preservation_overdue', (
      select count(*)
      from preservation_plans pp
      where pp.status = 'active'
        and pp.next_due_date < current_date
        and pp.project_id in (select id from proj)
    ),
    'actions_mine', (
      select count(*)
      from actions a
      where a.owner_id = auth.uid()
        and a.status in ('open', 'in_progress')
        and a.project_id in (select id from proj)
    ),
    'actions_verify', (
      select case when (select role from me) <> 'client' then (
        select count(*)
        from actions a
        where a.status = 'done'
          and a.done_by is distinct from auth.uid()
          and a.project_id in (select id from proj)
      ) else 0 end
    ),
    'constraints_mine', (
      select count(*)
      from project_constraints c
      where c.owner_id = auth.uid()
        and c.status = 'open'
        and c.project_id in (select id from proj)
    ),
    'handovers_to_receive', (
      select case when (select role from me) <> 'client' then (
        select count(*)
        from shift_handovers h
        where h.status = 'handed_over'
          and h.handed_by is distinct from auth.uid()
          and h.project_id in (select id from proj)
      ) else 0 end
    )
  );
$function$;
