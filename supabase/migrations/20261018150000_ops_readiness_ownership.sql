-- Fase 6 del plan readiness, sesión 3 — readiness de operaciones y traspaso de propiedad del sistema
-- (2026-10-16, decisiones de Luis, doc §12.20–26):
--   ops_personnel           registro de personal por proyecto (vinculable a un usuario, sin exigirlo).
--   competency_records      historial persona × sistema, nivel 0–4 con evidencia y vencimiento; vigente = última
--                           evaluación no vencida (vencida cuenta 0). Evalúa un líder+ o alguien de nivel 4 en el
--                           sistema; nunca uno mismo.
--   system_competency_targets  personas en nivel ≥ 3 requeridas POR TURNO (por defecto 2; sin turnos = total).
--   critical_spares         repuestos y herramientas especiales por sistema.
--   system_ownership        etapa vigente: commissioning → shadowing → joint_operation → operations.
--   ownership_transfers     TRF-0001: checklist congelado + excepciones justificadas; firma Comisionamiento
--                           (líder+) y Operaciones (líder+ o client), dos personas; la segunda firma recalcula el
--                           checklist; reversión a una etapa anterior sin checklist y con motivo (el paquete de
--                           handover del sistema pasa a SUPERSEDED). El paquete se genera en la app al llegar a
--                           Operaciones y se enlaza con link_transfer_handover (service_role).

-- ── 1. Tablas ────────────────────────────────────────────────────────────
CREATE TABLE public.ops_personnel (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  full_name  text NOT NULL,
  company    text,
  position   text,
  shift      text,
  user_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  active     boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_personnel_name_check CHECK (length(btrim(full_name)) BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX ops_personnel_user_uq ON public.ops_personnel (project_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX ops_personnel_project_idx ON public.ops_personnel (project_id);

CREATE TABLE public.competency_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  person_id     uuid NOT NULL REFERENCES public.ops_personnel(id) ON DELETE CASCADE,
  system_id     uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  level         smallint NOT NULL,
  evidence_kind text NOT NULL DEFAULT 'ojt',
  evidence      text,
  assessed_by   uuid,
  assessed_at   date NOT NULL DEFAULT current_date,
  expires_at    date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competency_records_level_check CHECK (level BETWEEN 0 AND 4),
  CONSTRAINT competency_records_kind_check CHECK (evidence_kind IN ('course', 'ojt', 'assessment', 'other')),
  CONSTRAINT competency_records_expiry_check CHECK (expires_at IS NULL OR expires_at >= assessed_at)
);
CREATE INDEX competency_records_lookup_idx ON public.competency_records (person_id, system_id, assessed_at DESC, created_at DESC);
CREATE INDEX competency_records_system_idx ON public.competency_records (system_id);

CREATE TABLE public.system_competency_targets (
  system_id  uuid PRIMARY KEY REFERENCES public.systems(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  required   smallint NOT NULL DEFAULT 2,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_competency_targets_required_check CHECK (required BETWEEN 1 AND 20)
);

CREATE TABLE public.critical_spares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_id     uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'spare',
  item          text NOT NULL,
  part_number   text,
  tag_id        uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  is_critical   boolean NOT NULL DEFAULT true,
  qty_required  numeric NOT NULL DEFAULT 1,
  qty_available numeric NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'not_available',
  eta           date,
  notes         text,
  updated_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT critical_spares_kind_check CHECK (kind IN ('spare', 'special_tool')),
  CONSTRAINT critical_spares_status_check CHECK (status IN ('available', 'ordered', 'not_available')),
  CONSTRAINT critical_spares_item_check CHECK (length(btrim(item)) BETWEEN 1 AND 200),
  CONSTRAINT critical_spares_qty_check CHECK (qty_required >= 0 AND qty_available >= 0)
);
CREATE INDEX critical_spares_system_idx ON public.critical_spares (system_id);

CREATE TABLE public.system_ownership (
  system_id        uuid PRIMARY KEY REFERENCES public.systems(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage            text NOT NULL DEFAULT 'commissioning',
  since            timestamptz NOT NULL DEFAULT now(),
  last_transfer_id uuid,
  CONSTRAINT system_ownership_stage_check CHECK (stage IN ('commissioning', 'shadowing', 'joint_operation', 'operations'))
);
CREATE INDEX system_ownership_project_idx ON public.system_ownership (project_id);

CREATE TABLE public.ownership_transfers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id              uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_id               uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  seq                     integer NOT NULL,
  number                  text NOT NULL,
  from_stage              text NOT NULL,
  to_stage                text NOT NULL,
  is_reversal             boolean NOT NULL DEFAULT false,
  reason                  text,
  status                  text NOT NULL DEFAULT 'pending_signatures',
  checklist               jsonb NOT NULL DEFAULT '[]'::jsonb,
  exceptions              jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_by            uuid,
  requested_at            timestamptz NOT NULL DEFAULT now(),
  commissioning_signed_by uuid, commissioning_signed_at timestamptz,
  operations_signed_by    uuid, operations_signed_at    timestamptz,
  completed_at            timestamptz,
  cancelled_by            uuid, cancelled_at timestamptz, cancel_reason text,
  handover_package_id     uuid REFERENCES public.handover_packages(id) ON DELETE SET NULL,
  content_hash            text,
  CONSTRAINT ownership_transfers_stage_check CHECK (from_stage IN ('commissioning', 'shadowing', 'joint_operation', 'operations')
                                               AND to_stage IN ('commissioning', 'shadowing', 'joint_operation', 'operations')),
  CONSTRAINT ownership_transfers_status_check CHECK (status IN ('pending_signatures', 'completed', 'cancelled')),
  CONSTRAINT ownership_transfers_number_uq UNIQUE (project_id, number)
);
CREATE UNIQUE INDEX ownership_transfers_pending_uq ON public.ownership_transfers (system_id) WHERE status = 'pending_signatures';
ALTER TABLE public.system_ownership ADD CONSTRAINT system_ownership_last_transfer_fk
  FOREIGN KEY (last_transfer_id) REFERENCES public.ownership_transfers(id) ON DELETE SET NULL;

ALTER TABLE public.ops_personnel             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_competency_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.critical_spares           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_ownership          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ownership_transfers       ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_personnel_select ON public.ops_personnel FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY competency_records_select ON public.competency_records FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY system_competency_targets_select ON public.system_competency_targets FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY critical_spares_select ON public.critical_spares FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY system_ownership_select ON public.system_ownership FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY ownership_transfers_select ON public.ownership_transfers FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));

-- Etapa inicial para los sistemas existentes y los nuevos.
INSERT INTO public.system_ownership (system_id, org_id, project_id)
SELECT s.id, p.org_id, s.project_id FROM public.systems s JOIN public.projects p ON p.id = s.project_id
ON CONFLICT (system_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_system_ownership()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  INSERT INTO system_ownership (system_id, org_id, project_id)
  SELECT NEW.id, p.org_id, NEW.project_id FROM projects p WHERE p.id = NEW.project_id
  ON CONFLICT (system_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER systems_seed_ownership AFTER INSERT ON public.systems FOR EACH ROW EXECUTE FUNCTION public.seed_system_ownership();

-- ── 2. Numeración y helpers ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mgmt_next_seq(p_table text, p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_seq integer;
BEGIN
  IF p_table NOT IN ('actions', 'project_constraints', 'technical_queries', 'decisions', 'procedures', 'procedure_runs', 'lineup_sheets',
                     'startup_events', 'ownership_transfers') THEN
    RAISE EXCEPTION 'Tabla no válida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mgmt:' || p_table || ':' || p_project_id::text));
  EXECUTE format('SELECT COALESCE(MAX(seq), 0) + 1 FROM public.%I WHERE project_id = $1', p_table)
    INTO v_seq USING p_project_id;
  RETURN v_seq;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.ownership_stage_index(p_stage text)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT array_position(ARRAY['commissioning', 'shadowing', 'joint_operation', 'operations'], p_stage);
$fn$;

-- Nivel vigente de una persona en un sistema (última evaluación; vencida = 0; sin registros = 0).
CREATE OR REPLACE FUNCTION public.person_system_level(p_person_id uuid, p_system_id uuid)
RETURNS smallint
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE((
    SELECT CASE WHEN cr.expires_at IS NOT NULL AND cr.expires_at < current_date THEN 0 ELSE cr.level END
    FROM competency_records cr WHERE cr.person_id = p_person_id AND cr.system_id = p_system_id
    ORDER BY cr.assessed_at DESC, cr.created_at DESC LIMIT 1), 0)::smallint;
$fn$;

-- Personal competente por turno: personal activo del sistema (con alguna evaluación en él), agrupado por turno.
CREATE OR REPLACE FUNCTION public.system_staffing(p_system_id uuid, p_level integer)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH people AS (
    SELECT op.id, NULLIF(btrim(op.shift), '') AS shift, public.person_system_level(op.id, p_system_id) AS lvl
    FROM ops_personnel op
    WHERE op.active AND EXISTS (SELECT 1 FROM competency_records cr WHERE cr.person_id = op.id AND cr.system_id = p_system_id)
  ),
  target AS (SELECT COALESCE((SELECT required FROM system_competency_targets WHERE system_id = p_system_id), 2) AS req),
  shifts AS (
    SELECT COALESCE(shift, '—') AS shift, COUNT(*) FILTER (WHERE lvl >= p_level) AS ok FROM people
    GROUP BY COALESCE(shift, '—')
  )
  SELECT jsonb_build_object(
    'level', p_level, 'required', (SELECT req FROM target),
    'by_shift', COALESCE((SELECT jsonb_agg(jsonb_build_object('shift', shift, 'count', ok) ORDER BY shift) FROM shifts), '[]'::jsonb),
    'ok', EXISTS (SELECT 1 FROM shifts) AND NOT EXISTS (SELECT 1 FROM shifts WHERE ok < (SELECT req FROM target)));
$fn$;

-- Checklist del traspaso hacia una etapa (§12.22). Ítems: [{key, ok, detail}].
CREATE OR REPLACE FUNCTION public.ownership_checklist(p_system_id uuid, p_to_stage text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_proj uuid; v_items jsonb := '[]'::jsonb; v_pre jsonb; v_st jsonb; v_n integer; v_list jsonb;
BEGIN
  SELECT project_id INTO v_proj FROM systems WHERE id = p_system_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(v_proj) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF p_to_stage = 'shadowing' THEN
    SELECT jsonb_agg(jsonb_build_object('number', p.number, 'rev', r.rev, 'field_verified', r.field_verified_at IS NOT NULL)) INTO v_list
    FROM procedures p JOIN procedure_revisions r ON r.id = p.current_revision_id AND r.status = 'approved'
    WHERE p.system_id = p_system_id AND p.kind = 'startup';
    v_items := v_items || jsonb_build_object('key', 'startup_procedure',
      'ok', EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_list, '[]'::jsonb)) x WHERE (x ->> 'field_verified')::boolean),
      'detail', jsonb_build_object('procedures', COALESCE(v_list, '[]'::jsonb)));
    v_st := public.system_staffing(p_system_id, 1);
    v_items := v_items || jsonb_build_object('key', 'staff_level_1', 'ok', (v_st ->> 'ok')::boolean, 'detail', v_st);

  ELSIF p_to_stage = 'joint_operation' THEN
    v_pre := public.startup_prerequisites(p_system_id);
    v_items := v_items || jsonb_build_object('key', 'startup_gate', 'ok', (v_pre ->> 'gate_ok')::boolean,
      'detail', jsonb_build_object('gate', v_pre ->> 'gate_code', 'status', v_pre ->> 'gate_status'));
    SELECT jsonb_build_object('number', number, 'stale', public.lineup_is_stale(id)) INTO v_list
    FROM lineup_sheets WHERE system_id = p_system_id AND status = 'verified' ORDER BY public.lineup_is_stale(id), verified_at DESC LIMIT 1;
    v_items := v_items || jsonb_build_object('key', 'lineup_verified',
      'ok', v_list IS NOT NULL AND NOT (v_list ->> 'stale')::boolean, 'detail', COALESCE(v_list, '{}'::jsonb));
    SELECT jsonb_build_object('number', number, 'witnessed_at', witness_at) INTO v_list
    FROM startup_events WHERE system_id = p_system_id AND milestone = 'first_startup' AND status = 'witnessed' LIMIT 1;
    v_items := v_items || jsonb_build_object('key', 'first_startup_witnessed', 'ok', v_list IS NOT NULL, 'detail', COALESCE(v_list, '{}'::jsonb));
    v_st := public.system_staffing(p_system_id, 2);
    v_items := v_items || jsonb_build_object('key', 'staff_level_2', 'ok', (v_st ->> 'ok')::boolean, 'detail', v_st);

  ELSIF p_to_stage = 'operations' THEN
    v_st := public.system_staffing(p_system_id, 3);
    v_items := v_items || jsonb_build_object('key', 'staff_level_3', 'ok', (v_st ->> 'ok')::boolean, 'detail', v_st);
    SELECT COUNT(*), COALESCE(jsonb_agg(jsonb_build_object('item', item, 'status', status, 'available', qty_available, 'required', qty_required, 'eta', eta)), '[]'::jsonb)
      INTO v_n, v_list
    FROM critical_spares WHERE system_id = p_system_id AND is_critical AND NOT (status = 'available' AND qty_available >= qty_required);
    v_items := v_items || jsonb_build_object('key', 'critical_spares', 'ok', v_n = 0, 'detail', jsonb_build_object('missing', v_list));
    SELECT COUNT(*) INTO v_n FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id
     WHERE ss.system_id = p_system_id AND p.category = 'A' AND p.status IN ('open', 'in_progress');
    v_items := v_items || jsonb_build_object('key', 'no_open_cat_a', 'ok', v_n = 0, 'detail', jsonb_build_object('open', v_n));
  END IF;
  RETURN v_items;
END;
$fn$;

-- ── 3. Personal, competencias y repuestos ────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_ops_person(
  p_project_id uuid, p_person_id uuid, p_full_name text, p_company text DEFAULT NULL, p_position text DEFAULT NULL,
  p_shift text DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_active boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF public.mgmt_text(p_full_name, 200) IS NULL THEN RAISE EXCEPTION 'El nombre es obligatorio' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, NULL, p_user_id);
  IF p_person_id IS NULL THEN
    INSERT INTO ops_personnel (org_id, project_id, full_name, company, position, shift, user_id, active, created_by)
    VALUES (v_org, p_project_id, public.mgmt_text(p_full_name, 200), public.mgmt_text(p_company, 200), public.mgmt_text(p_position, 200),
            public.mgmt_text(p_shift, 30), p_user_id, COALESCE(p_active, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE ops_personnel SET full_name = public.mgmt_text(p_full_name, 200), company = public.mgmt_text(p_company, 200),
           position = public.mgmt_text(p_position, 200), shift = public.mgmt_text(p_shift, 30), user_id = p_user_id,
           active = COALESCE(p_active, true), updated_at = now()
     WHERE id = p_person_id AND project_id = p_project_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Persona no encontrada' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN v_id;
END;
$fn$;

-- Evaluación: líder+ o persona vinculada con nivel 4 en ese sistema; nunca la propia.
CREATE OR REPLACE FUNCTION public.record_competency(
  p_person_id uuid, p_system_id uuid, p_level integer, p_evidence_kind text DEFAULT 'ojt', p_evidence text DEFAULT NULL,
  p_assessed_at date DEFAULT NULL, p_expires_at date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE pe ops_personnel%ROWTYPE; v_role text; v_trainer boolean; v_id uuid;
BEGIN
  SELECT * INTO pe FROM ops_personnel WHERE id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Persona no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(pe.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM systems WHERE id = p_system_id AND project_id = pe.project_id) THEN
    RAISE EXCEPTION 'El sistema no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF pe.user_id = auth.uid() THEN RAISE EXCEPTION 'Nadie evalúa su propia competencia' USING ERRCODE = '42501'; END IF;
  v_trainer := EXISTS (SELECT 1 FROM ops_personnel t WHERE t.project_id = pe.project_id AND t.user_id = auth.uid() AND t.active
                        AND public.person_system_level(t.id, p_system_id) = 4);
  IF NOT (v_role IN ('owner', 'admin', 'architect', 'leader') OR v_trainer) THEN
    RAISE EXCEPTION 'Evalúa un líder o una persona de nivel 4 en el sistema' USING ERRCODE = '42501';
  END IF;
  IF p_level IS NULL OR p_level NOT BETWEEN 0 AND 4 THEN RAISE EXCEPTION 'Nivel no válido (0–4)' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_assessed_at, current_date) > current_date THEN RAISE EXCEPTION 'La fecha de evaluación no puede ser futura' USING ERRCODE = '22023'; END IF;
  INSERT INTO competency_records (org_id, project_id, person_id, system_id, level, evidence_kind, evidence, assessed_by, assessed_at, expires_at)
  VALUES (pe.org_id, pe.project_id, pe.id, p_system_id, p_level, COALESCE(p_evidence_kind, 'ojt'), public.mgmt_text(p_evidence, 2000),
          auth.uid(), COALESCE(p_assessed_at, current_date), p_expires_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_competency_target(p_system_id uuid, p_required integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_proj uuid; v_role text;
BEGIN
  SELECT project_id INTO v_proj FROM systems WHERE id = p_system_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_proj);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_required IS NULL OR p_required NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Umbral no válido (1–20)' USING ERRCODE = '22023'; END IF;
  INSERT INTO system_competency_targets (system_id, project_id, required, updated_by) VALUES (p_system_id, v_proj, p_required, auth.uid())
  ON CONFLICT (system_id) DO UPDATE SET required = EXCLUDED.required, updated_by = EXCLUDED.updated_by, updated_at = now();
END;
$fn$;

CREATE OR REPLACE FUNCTION public.upsert_critical_spare(
  p_project_id uuid, p_spare_id uuid, p_system_id uuid, p_item text, p_kind text DEFAULT 'spare', p_part_number text DEFAULT NULL,
  p_tag_id uuid DEFAULT NULL, p_is_critical boolean DEFAULT true, p_qty_required numeric DEFAULT 1, p_qty_available numeric DEFAULT 0,
  p_status text DEFAULT 'not_available', p_eta date DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_org uuid; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_system_id IS NULL THEN RAISE EXCEPTION 'El repuesto necesita un sistema' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, NULL);
  IF p_tag_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tags WHERE id = p_tag_id AND project_id = p_project_id) THEN
    RAISE EXCEPTION 'El tag no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF p_spare_id IS NULL THEN
    INSERT INTO critical_spares (org_id, project_id, system_id, kind, item, part_number, tag_id, is_critical, qty_required, qty_available, status, eta, notes, updated_by)
    VALUES (v_org, p_project_id, p_system_id, COALESCE(p_kind, 'spare'), public.mgmt_text(p_item, 200), public.mgmt_text(p_part_number, 100), p_tag_id,
            COALESCE(p_is_critical, true), COALESCE(p_qty_required, 1), COALESCE(p_qty_available, 0), COALESCE(p_status, 'not_available'), p_eta,
            public.mgmt_text(p_notes, 2000), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE critical_spares SET system_id = p_system_id, kind = COALESCE(p_kind, 'spare'), item = public.mgmt_text(p_item, 200),
           part_number = public.mgmt_text(p_part_number, 100), tag_id = p_tag_id, is_critical = COALESCE(p_is_critical, true),
           qty_required = COALESCE(p_qty_required, 1), qty_available = COALESCE(p_qty_available, 0), status = COALESCE(p_status, 'not_available'),
           eta = p_eta, notes = public.mgmt_text(p_notes, 2000), updated_by = auth.uid(), updated_at = now()
     WHERE id = p_spare_id AND project_id = p_project_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Repuesto no encontrado' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_critical_spare(p_spare_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_proj uuid; v_role text;
BEGIN
  SELECT project_id INTO v_proj FROM critical_spares WHERE id = p_spare_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Repuesto no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_proj);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  DELETE FROM critical_spares WHERE id = p_spare_id;
END;
$fn$;

-- ── 4. Traspasos ─────────────────────────────────────────────────────────
-- Pedir: la etapa siguiente (con checklist; cada falta necesita justificación ≥ 10 caracteres) o una anterior
-- (reversión: sin checklist y con motivo). Un traspaso pendiente por sistema.
CREATE OR REPLACE FUNCTION public.request_ownership_transfer(p_system_id uuid, p_to_stage text, p_exceptions jsonb DEFAULT '[]'::jsonb, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_proj uuid; v_org uuid; v_role text; v_from text; v_seq integer; v_id uuid; v_check jsonb := '[]'::jsonb; v_exc jsonb := '[]'::jsonb;
        v_reversal boolean; v_item jsonb; v_just text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT s.project_id, p.org_id INTO v_proj, v_org FROM systems s JOIN projects p ON p.id = s.project_id WHERE s.id = p_system_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_proj);
  IF auth.uid() IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  INSERT INTO system_ownership (system_id, org_id, project_id) VALUES (p_system_id, v_org, v_proj) ON CONFLICT (system_id) DO NOTHING;
  SELECT stage INTO v_from FROM system_ownership WHERE system_id = p_system_id FOR UPDATE;
  IF public.ownership_stage_index(p_to_stage) IS NULL THEN RAISE EXCEPTION 'Etapa no válida' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM ownership_transfers WHERE system_id = p_system_id AND status = 'pending_signatures') THEN
    RAISE EXCEPTION 'Ya hay un traspaso pendiente de firmas en este sistema' USING ERRCODE = 'P0001';
  END IF;

  IF public.ownership_stage_index(p_to_stage) = public.ownership_stage_index(v_from) + 1 THEN
    v_reversal := false;
    v_check := public.ownership_checklist(p_system_id, p_to_stage);
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_check) WHERE NOT (value ->> 'ok')::boolean LOOP
      SELECT public.mgmt_text(x ->> 'justification', 2000) INTO v_just
      FROM jsonb_array_elements(COALESCE(p_exceptions, '[]'::jsonb)) x WHERE x ->> 'key' = v_item ->> 'key' LIMIT 1;
      IF v_just IS NULL OR length(v_just) < 10 THEN
        RAISE EXCEPTION 'Falta «%»: justifica la excepción (10 caracteres o más) para pedir el traspaso', v_item ->> 'key' USING ERRCODE = 'P0001';
      END IF;
      v_exc := v_exc || jsonb_build_object('key', v_item ->> 'key', 'justification', v_just);
    END LOOP;
  ELSIF public.ownership_stage_index(p_to_stage) < public.ownership_stage_index(v_from) THEN
    v_reversal := true;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Indica el motivo de la reversión (10 caracteres o más)' USING ERRCODE = '22023'; END IF;
  ELSE
    RAISE EXCEPTION 'Solo se pide la etapa siguiente (o una anterior como reversión)' USING ERRCODE = 'P0001';
  END IF;

  v_seq := public.mgmt_next_seq('ownership_transfers', v_proj);
  INSERT INTO ownership_transfers (org_id, project_id, system_id, seq, number, from_stage, to_stage, is_reversal, reason, checklist, exceptions, requested_by)
  VALUES (v_org, v_proj, p_system_id, v_seq, 'TRF-' || lpad(v_seq::text, 4, '0'), v_from, p_to_stage, v_reversal, v_reason, v_check, v_exc, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- Firmar como Comisionamiento (líder+) u Operaciones (líder+ o client); dos personas distintas. La segunda
-- firma recalcula el checklist (traspaso hacia adelante) y completa el traspaso.
CREATE OR REPLACE FUNCTION public.sign_ownership_transfer(p_transfer_id uuid, p_capacity text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE tr ownership_transfers%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_item jsonb; v_new text;
BEGIN
  SELECT * INTO tr FROM ownership_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF tr.status <> 'pending_signatures' THEN RAISE EXCEPTION 'El traspaso % no espera firmas', tr.number USING ERRCODE = 'P0001'; END IF;
  v_role := public.register_caller_role(tr.project_id);
  IF v_uid IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF p_capacity = 'commissioning' THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol no firma como Comisionamiento' USING ERRCODE = '42501'; END IF;
    IF tr.commissioning_signed_by IS NOT NULL THEN RAISE EXCEPTION 'Comisionamiento ya firmó' USING ERRCODE = 'P0001'; END IF;
    IF tr.operations_signed_by = v_uid THEN RAISE EXCEPTION 'Las dos firmas deben ser de personas distintas' USING ERRCODE = '42501'; END IF;
    UPDATE ownership_transfers SET commissioning_signed_by = v_uid, commissioning_signed_at = now() WHERE id = tr.id RETURNING * INTO tr;
  ELSIF p_capacity = 'operations' THEN
    IF NOT (v_role = ANY (public.hold_release_roles('operations'))) THEN RAISE EXCEPTION 'Tu rol no firma como Operaciones' USING ERRCODE = '42501'; END IF;
    IF tr.operations_signed_by IS NOT NULL THEN RAISE EXCEPTION 'Operaciones ya firmó' USING ERRCODE = 'P0001'; END IF;
    IF tr.commissioning_signed_by = v_uid THEN RAISE EXCEPTION 'Las dos firmas deben ser de personas distintas' USING ERRCODE = '42501'; END IF;
    UPDATE ownership_transfers SET operations_signed_by = v_uid, operations_signed_at = now() WHERE id = tr.id RETURNING * INTO tr;
  ELSE
    RAISE EXCEPTION 'Capacidad no válida' USING ERRCODE = '22023';
  END IF;

  IF tr.commissioning_signed_by IS NULL OR tr.operations_signed_by IS NULL THEN RETURN 'pending_signatures'; END IF;

  -- Segunda firma: el checklist no puede haber empeorado sin justificación.
  IF NOT tr.is_reversal THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(public.ownership_checklist(tr.system_id, tr.to_stage)) WHERE NOT (value ->> 'ok')::boolean LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(tr.exceptions) x WHERE x ->> 'key' = v_item ->> 'key') THEN
        v_new := v_item ->> 'key';
        RAISE EXCEPTION 'El checklist cambió desde la solicitud: ahora falta «%». Cancela y vuelve a pedir el traspaso', v_new USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  UPDATE ownership_transfers SET status = 'completed', completed_at = now(),
         content_hash = encode(sha256(convert_to(jsonb_build_object('number', tr.number, 'system', tr.system_id, 'from', tr.from_stage, 'to', tr.to_stage,
           'checklist', tr.checklist, 'exceptions', tr.exceptions, 'reason', tr.reason, 'c', tr.commissioning_signed_by, 'c_at', tr.commissioning_signed_at,
           'o', tr.operations_signed_by, 'o_at', tr.operations_signed_at)::text, 'UTF8')), 'hex')
   WHERE id = tr.id;
  UPDATE system_ownership SET stage = tr.to_stage, since = now(), last_transfer_id = tr.id WHERE system_id = tr.system_id;
  -- Reversión desde Operaciones: el paquete de handover emitido por el traspaso anterior queda reemplazado (§12.26).
  IF tr.is_reversal AND tr.from_stage = 'operations' THEN
    UPDATE handover_packages SET status = 'SUPERSEDED'
     WHERE status = 'ISSUED' AND id IN (SELECT handover_package_id FROM ownership_transfers
                                        WHERE system_id = tr.system_id AND to_stage = 'operations' AND handover_package_id IS NOT NULL);
  END IF;
  RETURN 'completed';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cancel_ownership_transfer(p_transfer_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE tr ownership_transfers%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO tr FROM ownership_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(tr.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR NOT (tr.requested_by = auth.uid() OR v_role IN ('owner', 'admin', 'architect', 'leader')) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF tr.status <> 'pending_signatures' THEN RAISE EXCEPTION 'Solo se cancela un traspaso pendiente' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
  UPDATE ownership_transfers SET status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = v_reason WHERE id = tr.id;
END;
$fn$;

-- Enlaza el paquete de handover generado en la app (solo service_role).
CREATE OR REPLACE FUNCTION public.link_transfer_handover(p_transfer_id uuid, p_package_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE tr ownership_transfers%ROWTYPE;
BEGIN
  SELECT * INTO tr FROM ownership_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND OR tr.status <> 'completed' OR tr.to_stage <> 'operations' OR tr.is_reversal THEN
    RAISE EXCEPTION 'Solo se enlaza a un traspaso completado hacia Operaciones' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM handover_packages WHERE id = p_package_id AND project_id = tr.project_id) THEN
    RAISE EXCEPTION 'Paquete de otro proyecto' USING ERRCODE = '22023';
  END IF;
  UPDATE ownership_transfers SET handover_package_id = p_package_id WHERE id = tr.id;
END;
$fn$;

-- ── 5. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.seed_system_ownership()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ownership_stage_index(text)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.person_system_level(uuid, uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.system_staffing(uuid, integer)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ownership_checklist(uuid, text)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_ops_person(uuid, uuid, text, text, text, text, uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_competency(uuid, uuid, integer, text, text, date, date)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_competency_target(uuid, integer)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_critical_spare(uuid, uuid, uuid, text, text, text, uuid, boolean, numeric, numeric, text, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_critical_spare(uuid)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_ownership_transfer(uuid, text, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sign_ownership_transfer(uuid, text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_ownership_transfer(uuid, text)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.link_transfer_handover(uuid, uuid)              FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ownership_stage_index(text)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.person_system_level(uuid, uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ownership_checklist(uuid, text)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_ops_person(uuid, uuid, text, text, text, text, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_competency(uuid, uuid, integer, text, text, date, date)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_competency_target(uuid, integer)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_critical_spare(uuid, uuid, uuid, text, text, text, uuid, boolean, numeric, numeric, text, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_critical_spare(uuid)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_ownership_transfer(uuid, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_ownership_transfer(uuid, text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_ownership_transfer(uuid, text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_transfer_handover(uuid, uuid)               TO service_role;

-- ── 6. Mi trabajo: traspasos por firmar ─────────────────────────────────
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
    ),
    'transfers_to_sign', (
      select count(*)
      from ownership_transfers tr
      where tr.status = 'pending_signatures'
        and tr.project_id in (select id from proj)
        and auth.uid() is distinct from tr.commissioning_signed_by
        and auth.uid() is distinct from tr.operations_signed_by
        and ((tr.commissioning_signed_by is null and (select role from me) in ('owner', 'admin', 'architect', 'leader'))
          or (tr.operations_signed_by is null and (select role from me) = any (public.hold_release_roles('operations'))))
    )
  );
$function$;
