-- Fase 5 del plan readiness, sesión 2 — planificación por readiness (2026-10-16, decisiones de Luis, doc §11.10–16):
--   readiness_gates.weight        peso del gate en el avance físico (NULL = partes iguales).
--   system_gate_plans             forecast (cualquier no-client) y compromiso (líderes+) por sistema × gate.
--   system_gate_plan_events       historial; cambiar o quitar un compromiso exige motivo.
--   compute_system_progress       avance ponderado = Σ peso_g · (ITR aprobados / ITR) de la fase del gate;
--                                 gate sin ITR en el sistema = 0 % («progress by evidence»). El readiness
--                                 (gates aprobados) se reporta aparte, nunca mezclado.
--   compute_project_progress      por sistema; el total del proyecto pondera sistemas por cantidad de ITR.
--   system_progress_snapshots     por sistema y día (curva S) y mgmt_kpi_snapshots por proyecto y día
--                                 (KPIs calculables de gestión diaria), escritos por take_mgmt_snapshot
--                                 desde el cron /api/cron/snapshot (solo service_role).

-- ── 1. Peso por gate ─────────────────────────────────────────────────────
ALTER TABLE public.readiness_gates
  ADD COLUMN weight numeric(6,2),
  ADD CONSTRAINT readiness_gates_weight_check CHECK (weight IS NULL OR (weight >= 0 AND weight <= 1000));

-- ── 2. Forecast y compromiso por sistema × gate ─────────────────────────
CREATE TABLE public.system_gate_plans (
  system_id       uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  gate_id         uuid NOT NULL REFERENCES public.readiness_gates(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  forecast_date   date,
  forecast_by     uuid,
  forecast_at     timestamptz,
  commitment_date date,
  commitment_by   uuid,
  commitment_at   timestamptz,
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (system_id, gate_id)
);
CREATE INDEX system_gate_plans_project_idx ON public.system_gate_plans (project_id);

CREATE TABLE public.system_gate_plan_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_id  uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  gate_id    uuid NOT NULL REFERENCES public.readiness_gates(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  from_date  date,
  to_date    date,
  reason     text,
  user_id    uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_gate_plan_events_kind_check CHECK (kind IN ('forecast', 'commitment'))
);
CREATE INDEX system_gate_plan_events_idx ON public.system_gate_plan_events (system_id, gate_id, created_at);

-- ── 3. Snapshots diarios ─────────────────────────────────────────────────
CREATE TABLE public.system_progress_snapshots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_id      uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  snapshot_date  date NOT NULL,
  weighted_pct   numeric(7,4) NOT NULL DEFAULT 0,
  itr_total      integer NOT NULL DEFAULT 0,
  itr_approved   integer NOT NULL DEFAULT 0,
  gates_approved integer NOT NULL DEFAULT 0,
  gates_total    integer NOT NULL DEFAULT 0,
  per_gate       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_progress_snapshots_uq UNIQUE (system_id, snapshot_date)
);
CREATE INDEX system_progress_snapshots_project_idx ON public.system_progress_snapshots (project_id, snapshot_date);

CREATE TABLE public.mgmt_kpi_snapshots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  snapshot_date  date NOT NULL,
  weighted_pct   numeric(7,4) NOT NULL DEFAULT 0,
  itr_total      integer NOT NULL DEFAULT 0,
  gates_approved integer NOT NULL DEFAULT 0,
  gates_total    integer NOT NULL DEFAULT 0,
  kpis           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mgmt_kpi_snapshots_uq UNIQUE (project_id, snapshot_date)
);

ALTER TABLE public.system_gate_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_gate_plan_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_progress_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mgmt_kpi_snapshots        ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_gate_plans_select ON public.system_gate_plans FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY system_gate_plan_events_select ON public.system_gate_plan_events FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY system_progress_snapshots_select ON public.system_progress_snapshots FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY mgmt_kpi_snapshots_select ON public.mgmt_kpi_snapshots FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));

-- ── 4. Avance ponderado ──────────────────────────────────────────────────
-- Gates activos con fase de la org del sistema. Peso normalizado (NULL = 1). Sin ITR → pct 0 (no_itrs).
CREATE OR REPLACE FUNCTION public.compute_system_progress(p_system_id uuid)
RETURNS TABLE(
  gate_id      uuid,
  gate_code    text,
  gate_order   integer,
  phase_id     uuid,
  weight       numeric,
  itr_total    integer,
  itr_approved integer,
  pct          numeric,
  approved     boolean
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH sys AS (
    SELECT s.id, p.org_id FROM systems s JOIN projects p ON p.id = s.project_id WHERE s.id = p_system_id
  ),
  g AS (
    SELECT rg.id, rg.code, rg.order_index, rg.phase_id, COALESCE(rg.weight, 1) AS w
    FROM readiness_gates rg JOIN sys ON rg.org_id = sys.org_id
    WHERE rg.is_active AND rg.phase_id IS NOT NULL
  ),
  tot AS (SELECT SUM(w) AS tw FROM g)
  SELECT g.id, g.code, g.order_index, g.phase_id,
         CASE WHEN tot.tw > 0 THEN round(g.w / tot.tw, 6) ELSE 0 END,
         c.total, c.ok,
         CASE WHEN c.total > 0 THEN round(c.ok::numeric / c.total, 6) ELSE 0 END,
         EXISTS (SELECT 1 FROM system_gate_approvals a
                 WHERE a.system_id = p_system_id AND a.gate_id = g.id AND a.revoked_at IS NULL
                   AND a.status IN ('approved', 'approved_with_conditions'))
  FROM g CROSS JOIN tot
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE i.status = 'approved')::int AS ok
    FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id
    WHERE ss.system_id = p_system_id AND i.phase_id = g.phase_id
  ) c
  ORDER BY g.order_index, g.code;
$$;

CREATE OR REPLACE FUNCTION public.compute_project_progress(p_project_id uuid)
RETURNS TABLE(
  system_id      uuid,
  system_code    text,
  itr_total      integer,
  itr_approved   integer,
  weighted_pct   numeric,
  gates_approved integer,
  gates_total    integer
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT s.id, s.code,
         COALESCE(SUM(cp.itr_total), 0)::int,
         COALESCE(SUM(cp.itr_approved), 0)::int,
         round(COALESCE(SUM(cp.weight * cp.pct), 0), 6),
         (COUNT(*) FILTER (WHERE cp.approved))::int,
         COUNT(cp.gate_id)::int
  FROM systems s
  LEFT JOIN LATERAL public.compute_system_progress(s.id) cp ON true
  WHERE s.project_id = p_project_id
  GROUP BY s.id, s.code
  ORDER BY s.code;
$$;

-- ── 5. Forecast, compromiso y pesos ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_plan_context(p_system_id uuid, p_gate_id uuid, OUT o_project uuid, OUT o_org uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  SELECT s.project_id, p.org_id INTO o_project, o_org FROM systems s JOIN projects p ON p.id = s.project_id WHERE s.id = p_system_id;
  IF o_project IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM readiness_gates WHERE id = p_gate_id AND org_id = o_org AND is_active) THEN
    RAISE EXCEPTION 'Gate no válido para este sistema' USING ERRCODE = '22023';
  END IF;
END;
$fn$;

-- p_date NULL quita el forecast.
CREATE OR REPLACE FUNCTION public.set_gate_forecast(p_system_id uuid, p_gate_id uuid, p_date date, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_project uuid; v_org uuid; v_role text; v_old date;
BEGIN
  SELECT o_project, o_org INTO v_project, v_org FROM public.gate_plan_context(p_system_id, p_gate_id);
  v_role := public.register_caller_role(v_project);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  SELECT forecast_date INTO v_old FROM system_gate_plans WHERE system_id = p_system_id AND gate_id = p_gate_id FOR UPDATE;
  IF FOUND AND v_old IS NOT DISTINCT FROM p_date THEN RETURN; END IF;
  INSERT INTO system_gate_plans (system_id, gate_id, org_id, project_id, forecast_date, forecast_by, forecast_at)
  VALUES (p_system_id, p_gate_id, v_org, v_project, p_date, auth.uid(), now())
  ON CONFLICT (system_id, gate_id) DO UPDATE
    SET forecast_date = EXCLUDED.forecast_date, forecast_by = EXCLUDED.forecast_by, forecast_at = EXCLUDED.forecast_at, updated_at = now();
  INSERT INTO system_gate_plan_events (org_id, project_id, system_id, gate_id, kind, from_date, to_date, reason, user_id)
  VALUES (v_org, v_project, p_system_id, p_gate_id, 'forecast', v_old, p_date, public.mgmt_text(p_note, 2000), auth.uid());
END;
$fn$;

-- Fijar el primer compromiso no pide motivo; cambiarlo o quitarlo (NULL) sí.
CREATE OR REPLACE FUNCTION public.set_gate_commitment(p_system_id uuid, p_gate_id uuid, p_date date, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_project uuid; v_org uuid; v_role text; v_old date; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT o_project, o_org INTO v_project, v_org FROM public.gate_plan_context(p_system_id, p_gate_id);
  v_role := public.register_caller_role(v_project);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores fijan compromisos' USING ERRCODE = '42501';
  END IF;

  SELECT commitment_date INTO v_old FROM system_gate_plans WHERE system_id = p_system_id AND gate_id = p_gate_id FOR UPDATE;
  IF v_old IS NOT DISTINCT FROM p_date THEN RETURN; END IF;
  IF v_old IS NOT NULL AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'Indica el motivo del cambio de compromiso' USING ERRCODE = '22023';
  END IF;
  INSERT INTO system_gate_plans (system_id, gate_id, org_id, project_id, commitment_date, commitment_by, commitment_at)
  VALUES (p_system_id, p_gate_id, v_org, v_project, p_date, auth.uid(), now())
  ON CONFLICT (system_id, gate_id) DO UPDATE
    SET commitment_date = EXCLUDED.commitment_date, commitment_by = EXCLUDED.commitment_by, commitment_at = EXCLUDED.commitment_at, updated_at = now();
  INSERT INTO system_gate_plan_events (org_id, project_id, system_id, gate_id, kind, from_date, to_date, reason, user_id)
  VALUES (v_org, v_project, p_system_id, p_gate_id, 'commitment', v_old, p_date, v_reason, auth.uid());
END;
$fn$;

-- p_weights = [{"gate_id": "…", "weight": 30}|{"gate_id": "…", "weight": null}, …]
CREATE OR REPLACE FUNCTION public.set_gate_weights(p_org_id uuid, p_weights jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE e jsonb; v_w numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_members WHERE org_id = p_org_id AND user_id = auth.uid() AND role::text IN ('owner', 'admin', 'architect')) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_weights IS NULL OR jsonb_typeof(p_weights) <> 'array' OR jsonb_array_length(p_weights) > 100 THEN
    RAISE EXCEPTION 'Lista de pesos no válida' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_weights) LOOP
    IF NOT EXISTS (SELECT 1 FROM readiness_gates WHERE id = NULLIF(e ->> 'gate_id', '')::uuid AND org_id = p_org_id) THEN
      RAISE EXCEPTION 'Gate de otra organización' USING ERRCODE = '22023';
    END IF;
    v_w := NULLIF(e ->> 'weight', '')::numeric;
    IF v_w IS NOT NULL AND (v_w < 0 OR v_w > 1000) THEN RAISE EXCEPTION 'Peso fuera de rango (0–1000)' USING ERRCODE = '22023'; END IF;
    UPDATE readiness_gates SET weight = v_w WHERE id = (e ->> 'gate_id')::uuid;
  END LOOP;
END;
$fn$;

-- ── 6. Snapshot diario (cron, service_role) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.take_mgmt_snapshot(p_project_id uuid, p_date date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_org uuid; r record; v_systems integer := 0;
  v_itr bigint := 0; v_wsum numeric := 0; v_gapp integer := 0; v_gtot integer := 0; v_kpis jsonb;
  v_from timestamptz := (p_date - 30)::timestamptz; v_to timestamptz := (p_date + 1)::timestamptz;
BEGIN
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
             'on_time_30d', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to AND required_by IS NOT NULL AND responded_at::date <= required_by),
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
             'on_time_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to AND due_date IS NOT NULL AND done_at::date <= due_date),
             'with_due_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to AND due_date IS NOT NULL))
           FROM actions WHERE project_id = p_project_id),
    'constraints', (SELECT jsonb_build_object(
             'open', COUNT(*) FILTER (WHERE status = 'open'),
             'by_level', jsonb_build_object(
                '1', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 1),
                '2', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 2),
                '3', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 3),
                '4', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 4)),
             'avg_age_days', round(AVG(p_date - created_at::date) FILTER (WHERE status = 'open')::numeric, 1),
             'overdue', COUNT(*) FILTER (WHERE status = 'open' AND need_date < p_date),
             'closed_30d', COUNT(*) FILTER (WHERE closed_at >= v_from AND closed_at < v_to))
           FROM project_constraints WHERE project_id = p_project_id),
    -- Cumplimiento del compromiso: gates aprobados en la ventana que tenían compromiso.
    'commitments', (SELECT jsonb_build_object(
             'approved_30d', COUNT(*),
             'on_time_30d', COUNT(*) FILTER (WHERE a.approved_at::date <= gp.commitment_date))
           FROM system_gate_approvals a
           JOIN system_gate_plans gp ON gp.system_id = a.system_id AND gp.gate_id = a.gate_id AND gp.commitment_date IS NOT NULL
           WHERE a.project_id = p_project_id AND a.revoked_at IS NULL
             AND a.status IN ('approved', 'approved_with_conditions')
             AND a.approved_at >= v_from AND a.approved_at < v_to)
  ) INTO v_kpis;

  INSERT INTO mgmt_kpi_snapshots (org_id, project_id, snapshot_date, weighted_pct, itr_total, gates_approved, gates_total, kpis)
  VALUES (v_org, p_project_id, p_date, CASE WHEN v_itr > 0 THEN round(v_wsum / v_itr, 6) ELSE 0 END, v_itr, v_gapp, v_gtot, v_kpis)
  ON CONFLICT (project_id, snapshot_date) DO UPDATE
    SET weighted_pct = EXCLUDED.weighted_pct, itr_total = EXCLUDED.itr_total, gates_approved = EXCLUDED.gates_approved,
        gates_total = EXCLUDED.gates_total, kpis = EXCLUDED.kpis, created_at = now();

  RETURN jsonb_build_object('systems', v_systems, 'weighted_pct', CASE WHEN v_itr > 0 THEN round(v_wsum / v_itr, 6) ELSE 0 END);
END;
$fn$;

-- ── 7. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.compute_system_progress(uuid)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_project_progress(uuid)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gate_plan_context(uuid, uuid)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_gate_forecast(uuid, uuid, date, text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_gate_commitment(uuid, uuid, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_gate_weights(uuid, jsonb)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.take_mgmt_snapshot(uuid, date)             FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.compute_system_progress(uuid)              TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.compute_project_progress(uuid)             TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.set_gate_forecast(uuid, uuid, date, text)  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.set_gate_commitment(uuid, uuid, date, text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.set_gate_weights(uuid, jsonb)              TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.take_mgmt_snapshot(uuid, date)             TO service_role;
