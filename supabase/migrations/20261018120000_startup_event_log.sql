-- Fase 6 del plan readiness, sesión 2 — bitácora de eventos de arranque con parámetros IIoT
-- (2026-10-16, decisiones de Luis, doc §12.10–18):
--   startup_events (EVT-0001): hitos fijos por sistema (primera energización, primera rotación, primer arranque,
--     primer HC, primera operación estable, primer producto on-spec; uno vigente por sistema, con testigo de
--     capacidad fija) y eventos libres (trip, alarma, desviación, parada, observación). Anular con motivo.
--   startup_event_params: foto IIoT al registrar = muestra más cercana dentro de ±5 min (prefiere calidad 0),
--     con unidad, calidad y desfase; sin dato → iiot_missing (se completa a mano).
--   Bloqueo duro: primer arranque y primer HC exigen el gate de arranque del sistema (el que exige line-up;
--     si no hay, el último activo) aprobado con todas sus firmas y el PSSR más reciente del sistema aprobado.
--   daily_report_data + startup_events_today; my_work_counts + milestones_to_witness.

-- ── 1. Tablas ────────────────────────────────────────────────────────────
CREATE TABLE public.startup_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq              integer NOT NULL,
  number           text NOT NULL,
  system_id        uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  kind             text NOT NULL,
  milestone        text,
  category         text,
  occurred_at      timestamptz NOT NULL,
  title            text NOT NULL,
  description      text,
  run_id           uuid REFERENCES public.procedure_runs(id) ON DELETE SET NULL,
  status           text NOT NULL,
  recorded_by      uuid,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  witness_capacity text,
  witness_by       uuid,
  witness_at       timestamptz,
  voided_by        uuid,
  voided_at        timestamptz,
  void_reason      text,
  CONSTRAINT startup_events_kind_check CHECK (kind IN ('milestone', 'free')),
  CONSTRAINT startup_events_milestone_check CHECK (milestone IS NULL OR milestone IN
    ('first_energization', 'first_rotation', 'first_startup', 'first_hydrocarbon', 'first_stable_operation', 'first_on_spec_product')),
  CONSTRAINT startup_events_category_check CHECK (category IS NULL OR category IN ('trip', 'alarm', 'deviation', 'shutdown', 'observation')),
  CONSTRAINT startup_events_shape_check CHECK ((kind = 'milestone' AND milestone IS NOT NULL AND category IS NULL)
                                            OR (kind = 'free' AND category IS NOT NULL AND milestone IS NULL)),
  CONSTRAINT startup_events_status_check CHECK (status IN ('pending_witness', 'witnessed', 'recorded', 'voided')),
  CONSTRAINT startup_events_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT startup_events_number_uq UNIQUE (project_id, number)
);
CREATE UNIQUE INDEX startup_events_milestone_uq ON public.startup_events (system_id, milestone) WHERE kind = 'milestone' AND status <> 'voided';
CREATE INDEX startup_events_project_idx ON public.startup_events (project_id, occurred_at DESC);
CREATE INDEX startup_events_witness_idx ON public.startup_events (project_id) WHERE status = 'pending_witness';

CREATE TABLE public.startup_event_tags (
  event_id   uuid NOT NULL REFERENCES public.startup_events(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, tag_id)
);

CREATE TABLE public.startup_event_params (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES public.startup_events(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  signal_id  uuid REFERENCES public.signals(id) ON DELETE SET NULL,
  label      text NOT NULL,
  value      double precision,
  value_text text,
  unit       text,
  quality    smallint,
  sampled_at timestamptz,
  offset_s   integer,
  source     text NOT NULL,
  added_by   uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT startup_event_params_source_check CHECK (source IN ('iiot', 'iiot_missing', 'manual'))
);
CREATE INDEX startup_event_params_event_idx ON public.startup_event_params (event_id);

ALTER TABLE public.startup_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_event_tags   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_event_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY startup_events_select ON public.startup_events FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY startup_event_tags_select ON public.startup_event_tags FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY startup_event_params_select ON public.startup_event_params FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));

-- ── 2. Helpers ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mgmt_next_seq(p_table text, p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_seq integer;
BEGIN
  IF p_table NOT IN ('actions', 'project_constraints', 'technical_queries', 'decisions', 'procedures', 'procedure_runs', 'lineup_sheets', 'startup_events') THEN
    RAISE EXCEPTION 'Tabla no válida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mgmt:' || p_table || ':' || p_project_id::text));
  EXECUTE format('SELECT COALESCE(MAX(seq), 0) + 1 FROM public.%I WHERE project_id = $1', p_table)
    INTO v_seq USING p_project_id;
  RETURN v_seq;
END;
$fn$;

-- Capacidad del testigo por hito (§12.16).
CREATE OR REPLACE FUNCTION public.milestone_witness_capacity(p_milestone text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE WHEN p_milestone IN ('first_energization', 'first_rotation') THEN 'commissioning' ELSE 'operations' END;
$fn$;

-- Prerrequisitos de arranque del sistema: gate de arranque (el que exige line-up; si no, el último activo)
-- aprobado con todas sus firmas y PSSR más reciente aprobado.
CREATE OR REPLACE FUNCTION public.startup_prerequisites(p_system_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_proj uuid; v_org uuid; v_gate readiness_gates%ROWTYPE; v_appr text; v_pssr record;
BEGIN
  SELECT s.project_id, p.org_id INTO v_proj, v_org FROM systems s JOIN projects p ON p.id = s.project_id WHERE s.id = p_system_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(v_proj) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_gate FROM readiness_gates WHERE org_id = v_org AND is_active
   ORDER BY requires_lineup DESC, order_index DESC, code DESC LIMIT 1;
  SELECT status INTO v_appr FROM system_gate_approvals WHERE system_id = p_system_id AND gate_id = v_gate.id AND revoked_at IS NULL;
  SELECT review_number, status INTO v_pssr FROM pssr_reviews WHERE system_id = p_system_id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'gate_id', v_gate.id, 'gate_code', v_gate.code, 'gate_status', COALESCE(v_appr, 'not_approved'),
    'gate_ok', COALESCE(v_appr IN ('approved', 'approved_with_conditions'), false),
    'pssr_number', v_pssr.review_number, 'pssr_status', COALESCE(v_pssr.status, 'none'),
    'pssr_ok', COALESCE(v_pssr.status = 'approved', false));
END;
$fn$;

-- Foto de una señal en la hora del evento: muestra más cercana dentro de ±5 min, prefiriendo calidad 0.
CREATE OR REPLACE FUNCTION public.startup_snapshot_param(p_event_id uuid, p_project_id uuid, p_signal_id uuid, p_at timestamptz)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_sig record; v_s record;
BEGIN
  SELECT s.id, s.signal_tag, s.eng_unit INTO v_sig FROM signals s JOIN tags t ON t.id = s.tag_id
   WHERE s.id = p_signal_id AND t.project_id = p_project_id;
  IF v_sig.id IS NULL THEN RAISE EXCEPTION 'La señal no pertenece al proyecto' USING ERRCODE = '22023'; END IF;
  SELECT value, quality, sampled_at INTO v_s FROM signal_samples
   WHERE signal_id = p_signal_id AND sampled_at BETWEEN p_at - interval '5 minutes' AND p_at + interval '5 minutes'
   ORDER BY (quality <> 0), abs(extract(epoch FROM sampled_at - p_at)) LIMIT 1;
  INSERT INTO startup_event_params (event_id, project_id, signal_id, label, value, unit, quality, sampled_at, offset_s, source, added_by)
  VALUES (p_event_id, p_project_id, p_signal_id, v_sig.signal_tag, v_s.value, v_sig.eng_unit, v_s.quality, v_s.sampled_at,
          CASE WHEN v_s.sampled_at IS NOT NULL THEN round(extract(epoch FROM v_s.sampled_at - p_at))::int END,
          CASE WHEN v_s.sampled_at IS NOT NULL THEN 'iiot' ELSE 'iiot_missing' END, auth.uid());
END;
$fn$;

-- ── 3. RPCs ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_startup_event(
  p_project_id  uuid,
  p_system_id   uuid,
  p_kind        text,
  p_code        text,
  p_occurred_at timestamptz,
  p_title       text,
  p_description text   DEFAULT NULL,
  p_tag_ids     uuid[] DEFAULT NULL,
  p_run_id      uuid   DEFAULT NULL,
  p_signal_ids  uuid[] DEFAULT NULL,
  p_manual      jsonb  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid; v_pre jsonb; v_sig uuid; e jsonb; v_missing text[];
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_system_id IS NULL THEN RAISE EXCEPTION 'El evento necesita un sistema' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, NULL);
  IF p_occurred_at IS NULL OR p_occurred_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'La hora del evento no puede ser futura' USING ERRCODE = '22023'; END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  IF p_run_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM procedure_runs WHERE id = p_run_id AND project_id = p_project_id) THEN
    RAISE EXCEPTION 'La ejecución no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF p_tag_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_tag_ids) x WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.id = x AND t.project_id = p_project_id)) THEN
    RAISE EXCEPTION 'Hay tags que no pertenecen al proyecto' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'milestone' THEN
    IF EXISTS (SELECT 1 FROM startup_events WHERE system_id = p_system_id AND milestone = p_code AND kind = 'milestone' AND status <> 'voided') THEN
      RAISE EXCEPTION 'Este hito ya está registrado en el sistema: anúlalo con motivo para volver a registrarlo' USING ERRCODE = 'P0001';
    END IF;
    -- Bloqueo duro (§12.12): primer arranque y primer HC.
    IF p_code IN ('first_startup', 'first_hydrocarbon') THEN
      v_pre := public.startup_prerequisites(p_system_id);
      v_missing := ARRAY[]::text[];
      IF NOT (v_pre ->> 'gate_ok')::boolean THEN v_missing := v_missing || ('gate ' || COALESCE(v_pre ->> 'gate_code', '?') || ' aprobado con todas sus firmas'); END IF;
      IF NOT (v_pre ->> 'pssr_ok')::boolean THEN v_missing := v_missing || ('PSSR ' || COALESCE(v_pre ->> 'pssr_number', 'del sistema') || ' aprobado'); END IF;
      IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'No se puede registrar este hito: falta %', array_to_string(v_missing, ' y ') USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF p_kind <> 'free' THEN
    RAISE EXCEPTION 'Tipo de evento no válido' USING ERRCODE = '22023';
  END IF;

  v_seq := public.mgmt_next_seq('startup_events', p_project_id);
  INSERT INTO startup_events (org_id, project_id, seq, number, system_id, kind, milestone, category, occurred_at, title, description, run_id,
                              status, recorded_by, witness_capacity)
  VALUES (v_org, p_project_id, v_seq, 'EVT-' || lpad(v_seq::text, 4, '0'), p_system_id, p_kind,
          CASE WHEN p_kind = 'milestone' THEN p_code END, CASE WHEN p_kind = 'free' THEN p_code END,
          p_occurred_at, public.mgmt_text(p_title, 200), public.mgmt_text(p_description, 8000), p_run_id,
          CASE WHEN p_kind = 'milestone' THEN 'pending_witness' ELSE 'recorded' END, auth.uid(),
          CASE WHEN p_kind = 'milestone' THEN public.milestone_witness_capacity(p_code) END)
  RETURNING id INTO v_id;

  IF p_tag_ids IS NOT NULL THEN
    INSERT INTO startup_event_tags (event_id, tag_id, project_id) SELECT DISTINCT v_id, x, p_project_id FROM unnest(p_tag_ids) x;
  END IF;
  FOREACH v_sig IN ARRAY COALESCE(p_signal_ids, ARRAY[]::uuid[]) LOOP
    PERFORM public.startup_snapshot_param(v_id, p_project_id, v_sig, p_occurred_at);
  END LOOP;
  IF p_manual IS NOT NULL THEN
    IF jsonb_typeof(p_manual) <> 'array' OR jsonb_array_length(p_manual) > 50 THEN RAISE EXCEPTION 'Parámetros no válidos' USING ERRCODE = '22023'; END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(p_manual) LOOP
      IF public.mgmt_text(e ->> 'label', 100) IS NULL THEN CONTINUE; END IF;
      INSERT INTO startup_event_params (event_id, project_id, label, value, value_text, unit, source, added_by)
      VALUES (v_id, p_project_id, public.mgmt_text(e ->> 'label', 100),
              CASE WHEN (e ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (e ->> 'value')::double precision END,
              CASE WHEN NOT ((e ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$') THEN public.mgmt_text(e ->> 'value', 200) END,
              public.mgmt_text(e ->> 'unit', 30), 'manual', auth.uid());
    END LOOP;
  END IF;
  RETURN v_id;
END;
$fn$;

-- Valor manual (o completar una señal sin dato) mientras el hito no esté atestiguado.
CREATE OR REPLACE FUNCTION public.add_startup_event_param(p_event_id uuid, p_label text, p_value text, p_unit text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE ev startup_events%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO ev FROM startup_events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(ev.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF ev.status IN ('witnessed', 'voided') THEN RAISE EXCEPTION 'El evento % ya está cerrado', ev.number USING ERRCODE = 'P0001'; END IF;
  IF public.mgmt_text(p_label, 100) IS NULL OR public.mgmt_text(p_value, 200) IS NULL THEN RAISE EXCEPTION 'Indica parámetro y valor' USING ERRCODE = '22023'; END IF;
  INSERT INTO startup_event_params (event_id, project_id, label, value, value_text, unit, source, added_by)
  VALUES (ev.id, ev.project_id, public.mgmt_text(p_label, 100),
          CASE WHEN btrim(p_value) ~ '^-?[0-9]+([.,][0-9]+)?$' THEN replace(btrim(p_value), ',', '.')::double precision END,
          CASE WHEN NOT (btrim(p_value) ~ '^-?[0-9]+([.,][0-9]+)?$') THEN public.mgmt_text(p_value, 200) END,
          public.mgmt_text(p_unit, 30), 'manual', auth.uid());
END;
$fn$;

-- Atestiguar un hito: otra persona con rol habilitado para la capacidad del hito.
CREATE OR REPLACE FUNCTION public.witness_startup_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE ev startup_events%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO ev FROM startup_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evento no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF ev.status <> 'pending_witness' THEN RAISE EXCEPTION 'El evento no espera testigo' USING ERRCODE = 'P0001'; END IF;
  v_role := public.register_caller_role(ev.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR NOT (v_role = ANY (public.hold_release_roles(ev.witness_capacity))) THEN
    RAISE EXCEPTION 'Tu rol no puede atestiguar como %', ev.witness_capacity USING ERRCODE = '42501';
  END IF;
  IF auth.uid() = ev.recorded_by THEN RAISE EXCEPTION 'El testigo debe ser una persona distinta de quien registró el hito' USING ERRCODE = '42501'; END IF;
  UPDATE startup_events SET status = 'witnessed', witness_by = auth.uid(), witness_at = now() WHERE id = ev.id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.void_startup_event(p_event_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE ev startup_events%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO ev FROM startup_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(ev.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores anulan eventos' USING ERRCODE = '42501';
  END IF;
  IF ev.status = 'voided' THEN RAISE EXCEPTION 'El evento ya está anulado' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la anulación' USING ERRCODE = '22023'; END IF;
  UPDATE startup_events SET status = 'voided', voided_by = auth.uid(), voided_at = now(), void_reason = v_reason WHERE id = ev.id;
END;
$fn$;

-- ── 4. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.milestone_witness_capacity(text)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.startup_prerequisites(uuid)                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.startup_snapshot_param(uuid, uuid, uuid, timestamptz)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_startup_event(uuid, uuid, text, text, timestamptz, text, text, uuid[], uuid, uuid[], jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_startup_event_param(uuid, text, text, text)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.witness_startup_event(uuid)                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_startup_event(uuid, text)                           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.milestone_witness_capacity(text)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.startup_prerequisites(uuid)                               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_startup_event(uuid, uuid, text, text, timestamptz, text, text, uuid[], uuid, uuid[], jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_startup_event_param(uuid, text, text, text)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.witness_startup_event(uuid)                               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_startup_event(uuid, text)                            TO authenticated, service_role;

-- ── 5. Reporte diario: eventos de arranque del día ───────────────────────
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
          LIMIT 60) q), '[]'::jsonb),
    -- F6-S2: hitos y eventos de arranque del día (no anulados), con sus parámetros principales.
    'startup_events_today', COALESCE((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at') FROM (
          SELECT jsonb_build_object('number', ev.number, 'kind', ev.kind, 'code', COALESCE(ev.milestone, ev.category), 'title', ev.title,
                   'system', ds.code, 'occurred_at', ev.occurred_at, 'status', ev.status,
                   'params', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', pr.label, 'value', COALESCE(pr.value::text, pr.value_text), 'unit', pr.unit))
                                       FROM (SELECT * FROM startup_event_params WHERE event_id = ev.id AND source <> 'iiot_missing' ORDER BY created_at LIMIT 4) pr), '[]'::jsonb)) AS x
          FROM startup_events ev JOIN _dr_sys ds ON ds.id = ev.system_id
          WHERE ev.project_id = p_project_id AND ev.status <> 'voided' AND ev.occurred_at >= v_from AND ev.occurred_at < v_to
          LIMIT 30) q), '[]'::jsonb)
  );
  RETURN v_out;
END;
$fn$;

-- ── 6. Mi trabajo: hitos por atestiguar ──────────────────────────────────
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
    ),
    'holds_to_release', (
      select count(*)
      from procedure_run_steps rs
      join procedure_steps st on st.id = rs.step_id
      join procedure_runs r on r.id = rs.run_id
      where rs.status = 'at_hold'
        and r.status in ('at_hold', 'stopped')
        and rs.done_by is distinct from auth.uid()
        and (select role from me) = any (public.hold_release_roles(st.hold_capacity))
        and rs.project_id in (select id from proj)
    ),
    'lineup_to_verify', (
      select count(*)
      from lineup_items li
      join lineup_sheets s on s.id = li.sheet_id
      where li.is_critical and li.set_at is not null and li.verified_at is null
        and li.found_position = li.required_position
        and li.set_by is distinct from auth.uid()
        and s.status in ('issued', 'in_progress')
        and li.project_id in (select id from proj)
    ),
    'milestones_to_witness', (
      select count(*)
      from startup_events ev
      where ev.status = 'pending_witness'
        and ev.recorded_by is distinct from auth.uid()
        and (select role from me) = any (public.hold_release_roles(ev.witness_capacity))
        and ev.project_id in (select id from proj)
    )
  );
$function$;
