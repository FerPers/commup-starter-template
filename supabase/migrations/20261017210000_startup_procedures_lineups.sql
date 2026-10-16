-- Fase 6 del plan readiness, sesión 1 — procedimientos con hold points y hojas de line-up
-- (2026-10-16, decisiones de Luis, doc §12.1–9):
--   procedures (PRC-0001) → procedure_revisions (15 secciones fijas en jsonb; draft → in_review → approved →
--     superseded; aprueba un líder+ distinto del autor; «verificado en campo» lo firma alguien distinto de
--     quien aprobó; hash al aprobar) → procedure_steps (hold point con capacidad que libera, criterio de parada).
--   procedure_runs / procedure_run_steps: solo sobre la revisión aprobada vigente; pasos en orden; un hold
--     point detiene la ejecución hasta que lo libera OTRA persona con rol habilitado para la capacidad;
--     «Detener» con motivo; reanudar / abortar líder+.
--   lineup_sheets (LU-0001) / lineup_items: filas generadas desde tags de categoría «Válvulas» + manuales;
--     posición requerida/encontrada; verificar = otra persona y posición = requerida (las críticas lo exigen);
--     completar = todas alineadas + críticas verificadas → verified (hash); reemplaza las verificadas previas
--     del mismo sistema y propósito.
--   readiness_gates.requires_lineup + criterio implícito `lineup_verified` (bloqueante; una hoja verificada
--     queda desactualizada si un registro F3 del sistema cambia de estado después de verificarla).
--   Todo en línea (offline en una sesión aparte). Escritura solo por RPC SECURITY DEFINER.

-- ── 1. Procedimientos ────────────────────────────────────────────────────
CREATE TABLE public.procedures (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq                 integer NOT NULL,
  number              text NOT NULL,
  title               text NOT NULL,
  kind                text NOT NULL DEFAULT 'startup',
  system_id           uuid REFERENCES public.systems(id) ON DELETE SET NULL,
  current_revision_id uuid,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT procedures_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT procedures_kind_check CHECK (kind IN ('precommissioning', 'commissioning', 'startup', 'shutdown', 'emergency', 'normal_operation')),
  CONSTRAINT procedures_number_uq UNIQUE (project_id, number)
);
CREATE INDEX procedures_project_idx ON public.procedures (project_id);
CREATE INDEX procedures_system_idx ON public.procedures (system_id) WHERE system_id IS NOT NULL;

CREATE TABLE public.procedure_revisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id      uuid NOT NULL REFERENCES public.procedures(id) ON DELETE CASCADE,
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rev               integer NOT NULL,
  status            text NOT NULL DEFAULT 'draft',
  sections          jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_reason     text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  submitted_by      uuid, submitted_at      timestamptz,
  approved_by       uuid, approved_at       timestamptz,
  field_verified_by uuid, field_verified_at timestamptz, walkdown_note text,
  returned_reason   text,
  content_hash      text,
  CONSTRAINT procedure_revisions_status_check CHECK (status IN ('draft', 'in_review', 'approved', 'superseded')),
  CONSTRAINT procedure_revisions_sections_check CHECK (jsonb_typeof(sections) = 'object'),
  CONSTRAINT procedure_revisions_uq UNIQUE (procedure_id, rev)
);
ALTER TABLE public.procedures ADD CONSTRAINT procedures_current_revision_fk
  FOREIGN KEY (current_revision_id) REFERENCES public.procedure_revisions(id) ON DELETE SET NULL;

CREATE TABLE public.procedure_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id    uuid NOT NULL REFERENCES public.procedure_revisions(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ord            integer NOT NULL,
  action         text NOT NULL,
  responsible    text,
  expected_value text,
  tag_id         uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  is_hold_point  boolean NOT NULL DEFAULT false,
  hold_capacity  text,
  stop_criteria  text,
  CONSTRAINT procedure_steps_action_check CHECK (length(btrim(action)) >= 1),
  CONSTRAINT procedure_steps_capacity_check CHECK (hold_capacity IS NULL OR hold_capacity IN ('commissioning', 'operations', 'hse')),
  CONSTRAINT procedure_steps_hold_check CHECK (NOT is_hold_point OR hold_capacity IS NOT NULL),
  CONSTRAINT procedure_steps_ord_uq UNIQUE (revision_id, ord)
);

CREATE TABLE public.procedure_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  procedure_id uuid NOT NULL REFERENCES public.procedures(id) ON DELETE CASCADE,
  revision_id  uuid NOT NULL REFERENCES public.procedure_revisions(id) ON DELETE RESTRICT,
  system_id    uuid REFERENCES public.systems(id) ON DELETE SET NULL,
  seq          integer NOT NULL,
  number       text NOT NULL,
  status       text NOT NULL DEFAULT 'in_progress',
  started_by   uuid, started_at   timestamptz NOT NULL DEFAULT now(),
  stopped_by   uuid, stopped_at   timestamptz, stop_reason  text,
  completed_by uuid, completed_at timestamptz,
  aborted_by   uuid, aborted_at   timestamptz, abort_reason text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT procedure_runs_status_check CHECK (status IN ('in_progress', 'at_hold', 'stopped', 'completed', 'aborted')),
  CONSTRAINT procedure_runs_number_uq UNIQUE (project_id, number)
);
CREATE INDEX procedure_runs_procedure_idx ON public.procedure_runs (procedure_id);
CREATE INDEX procedure_runs_live_idx ON public.procedure_runs (project_id) WHERE status IN ('in_progress', 'at_hold', 'stopped');

CREATE TABLE public.procedure_run_steps (
  run_id           uuid NOT NULL REFERENCES public.procedure_runs(id) ON DELETE CASCADE,
  step_id          uuid NOT NULL REFERENCES public.procedure_steps(id) ON DELETE RESTRICT,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ord              integer NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  actual_value     text,
  comment          text,
  done_by          uuid, done_at     timestamptz,
  released_by      uuid, released_at timestamptz, release_role text,
  PRIMARY KEY (run_id, step_id),
  CONSTRAINT procedure_run_steps_status_check CHECK (status IN ('pending', 'done', 'at_hold', 'released', 'na'))
);
CREATE INDEX procedure_run_steps_hold_idx ON public.procedure_run_steps (project_id) WHERE status = 'at_hold';

-- ── 2. Line-ups ──────────────────────────────────────────────────────────
CREATE TABLE public.lineup_sheets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq           integer NOT NULL,
  number        text NOT NULL,
  system_id     uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  title         text NOT NULL,
  purpose       text NOT NULL DEFAULT 'startup',
  procedure_id  uuid REFERENCES public.procedures(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'draft',
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  issued_by     uuid, issued_at   timestamptz,
  verified_by   uuid, verified_at timestamptz,
  superseded_at timestamptz,
  content_hash  text,
  CONSTRAINT lineup_sheets_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT lineup_sheets_purpose_check CHECK (purpose IN ('startup', 'test', 'other')),
  CONSTRAINT lineup_sheets_status_check CHECK (status IN ('draft', 'issued', 'in_progress', 'verified', 'superseded')),
  CONSTRAINT lineup_sheets_number_uq UNIQUE (project_id, number)
);
CREATE INDEX lineup_sheets_system_idx ON public.lineup_sheets (system_id, status);

CREATE TABLE public.lineup_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id          uuid NOT NULL REFERENCES public.lineup_sheets(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ord               integer NOT NULL,
  tag_id            uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  label             text,
  required_position text,
  required_note     text,
  is_critical       boolean NOT NULL DEFAULT false,
  found_position    text,
  remarks           text,
  set_by      uuid, set_at      timestamptz,
  verified_by uuid, verified_at timestamptz,
  CONSTRAINT lineup_items_ref_check CHECK (tag_id IS NOT NULL OR length(btrim(COALESCE(label, ''))) >= 1),
  CONSTRAINT lineup_items_required_check CHECK (required_position IS NULL OR required_position IN ('open', 'closed', 'locked_open', 'locked_closed', 'auto', 'manual', 'throttled', 'other')),
  CONSTRAINT lineup_items_found_check CHECK (found_position IS NULL OR found_position IN ('open', 'closed', 'locked_open', 'locked_closed', 'auto', 'manual', 'throttled', 'other')),
  CONSTRAINT lineup_items_ord_uq UNIQUE (sheet_id, ord)
);
CREATE INDEX lineup_items_verify_idx ON public.lineup_items (project_id) WHERE is_critical AND set_at IS NOT NULL AND verified_at IS NULL;

ALTER TABLE public.readiness_gates ADD COLUMN requires_lineup boolean NOT NULL DEFAULT false;
-- Por defecto lo exige el gate de arranque: el último gate activo de cada org.
UPDATE public.readiness_gates rg SET requires_lineup = true
 WHERE rg.id IN (SELECT DISTINCT ON (org_id) id FROM public.readiness_gates WHERE is_active ORDER BY org_id, order_index DESC, code DESC);

ALTER TABLE public.procedures          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedure_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedure_steps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedure_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedure_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineup_sheets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineup_items        ENABLE ROW LEVEL SECURITY;
CREATE POLICY procedures_select ON public.procedures FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY procedure_revisions_select ON public.procedure_revisions FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY procedure_steps_select ON public.procedure_steps FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY procedure_runs_select ON public.procedure_runs FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY procedure_run_steps_select ON public.procedure_run_steps FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY lineup_sheets_select ON public.lineup_sheets FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY lineup_items_select ON public.lineup_items FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));

-- ── 3. Helpers ───────────────────────────────────────────────────────────
-- Numeración: amplía la lista blanca de mgmt_next_seq.
CREATE OR REPLACE FUNCTION public.mgmt_next_seq(p_table text, p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_seq integer;
BEGIN
  IF p_table NOT IN ('actions', 'project_constraints', 'technical_queries', 'decisions', 'procedures', 'procedure_runs', 'lineup_sheets') THEN
    RAISE EXCEPTION 'Tabla no válida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mgmt:' || p_table || ':' || p_project_id::text));
  EXECUTE format('SELECT COALESCE(MAX(seq), 0) + 1 FROM public.%I WHERE project_id = $1', p_table)
    INTO v_seq USING p_project_id;
  RETURN v_seq;
END;
$fn$;

-- Roles que liberan un hold point por capacidad (Operaciones/HSE incluyen al cliente = operadora).
CREATE OR REPLACE FUNCTION public.hold_release_roles(p_capacity text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE p_capacity
    WHEN 'commissioning' THEN ARRAY['owner', 'admin', 'architect', 'leader']
    WHEN 'operations'    THEN ARRAY['owner', 'admin', 'architect', 'leader', 'client']
    WHEN 'hse'           THEN ARRAY['owner', 'admin', 'architect', 'leader', 'client']
    ELSE ARRAY[]::text[] END;
$fn$;

-- Claves válidas de las 15 secciones (catálogo fijo, = src/lib/startup/catalog.ts).
CREATE OR REPLACE FUNCTION public.procedure_section_keys()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT ARRAY['purpose', 'scope', 'references', 'definitions', 'responsibilities', 'safety', 'prerequisites', 'isolations',
               'equipment', 'initial_lineup', 'sequence', 'stop_criteria', 'acceptance', 'reinstatement', 'records'];
$fn$;

CREATE OR REPLACE FUNCTION public.procedure_revision_hash(p_revision_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'procedure', p.number, 'title', p.title, 'rev', r.rev, 'sections', r.sections,
    'steps', COALESCE((SELECT jsonb_agg(jsonb_build_object('ord', s.ord, 'action', s.action, 'responsible', s.responsible,
                'expected', s.expected_value, 'tag', s.tag_id, 'hold', s.is_hold_point, 'capacity', s.hold_capacity,
                'stop', s.stop_criteria) ORDER BY s.ord) FROM procedure_steps s WHERE s.revision_id = r.id), '[]'::jsonb)
  )::text, 'UTF8')), 'hex')
  FROM procedure_revisions r JOIN procedures p ON p.id = r.procedure_id WHERE r.id = p_revision_id;
$fn$;

-- Reemplaza secciones y pasos de una revisión en borrador.
CREATE OR REPLACE FUNCTION public.procedure_write_content(r procedure_revisions, p_sections jsonb, p_steps jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE e jsonb; i integer := 0; v_clean jsonb := '{}'::jsonb; k text;
BEGIN
  IF p_sections IS NOT NULL THEN
    IF jsonb_typeof(p_sections) <> 'object' THEN RAISE EXCEPTION 'Secciones no válidas' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(p_sections) LOOP
      IF NOT (k = ANY (public.procedure_section_keys())) THEN RAISE EXCEPTION 'Sección desconocida: %', k USING ERRCODE = '22023'; END IF;
      IF public.mgmt_text(p_sections ->> k, 20000) IS NOT NULL THEN v_clean := v_clean || jsonb_build_object(k, public.mgmt_text(p_sections ->> k, 20000)); END IF;
    END LOOP;
    UPDATE procedure_revisions SET sections = v_clean, updated_at = now() WHERE id = r.id;
  END IF;
  IF p_steps IS NOT NULL THEN
    IF jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) > 500 THEN RAISE EXCEPTION 'Pasos no válidos' USING ERRCODE = '22023'; END IF;
    DELETE FROM procedure_steps WHERE revision_id = r.id;
    FOR e IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
      i := i + 1;
      IF NULLIF(e ->> 'tag_id', '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tags WHERE id = (e ->> 'tag_id')::uuid AND project_id = r.project_id) THEN
        RAISE EXCEPTION 'El tag del paso % no pertenece al proyecto', i USING ERRCODE = '22023';
      END IF;
      IF public.mgmt_text(e ->> 'action', 4000) IS NULL THEN RAISE EXCEPTION 'El paso % no tiene acción', i USING ERRCODE = '22023'; END IF;
      INSERT INTO procedure_steps (revision_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria)
      VALUES (r.id, r.project_id, i, public.mgmt_text(e ->> 'action', 4000), public.mgmt_text(e ->> 'responsible', 200),
              public.mgmt_text(e ->> 'expected_value', 500), NULLIF(e ->> 'tag_id', '')::uuid, COALESCE((e ->> 'is_hold_point')::boolean, false),
              CASE WHEN COALESCE((e ->> 'is_hold_point')::boolean, false) THEN COALESCE(NULLIF(e ->> 'hold_capacity', ''), 'commissioning') END,
              public.mgmt_text(e ->> 'stop_criteria', 2000));
    END LOOP;
  END IF;
END;
$fn$;

-- ── 4. RPCs de procedimientos ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_procedure(p_project_id uuid, p_title text, p_kind text DEFAULT 'startup', p_system_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid; v_rev uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, NULL);
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  v_seq := public.mgmt_next_seq('procedures', p_project_id);
  INSERT INTO procedures (org_id, project_id, seq, number, title, kind, system_id, created_by)
  VALUES (v_org, p_project_id, v_seq, 'PRC-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(p_title, 200), COALESCE(p_kind, 'startup'), p_system_id, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO procedure_revisions (procedure_id, org_id, project_id, rev, created_by) VALUES (v_id, v_org, p_project_id, 0, auth.uid()) RETURNING id INTO v_rev;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_procedure(p_procedure_id uuid, p_title text, p_kind text, p_system_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE p procedures%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO p FROM procedures WHERE id = p_procedure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  PERFORM public.mgmt_check_refs(p.project_id, p.org_id, p_system_id, NULL);
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  UPDATE procedures SET title = public.mgmt_text(p_title, 200), kind = p_kind, system_id = p_system_id, updated_at = now() WHERE id = p_procedure_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.save_procedure_revision(p_revision_id uuid, p_sections jsonb, p_steps jsonb, p_change_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r procedure_revisions%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM procedure_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Solo se edita una revisión en borrador' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.procedure_write_content(r, p_sections, p_steps);
  UPDATE procedure_revisions SET change_reason = COALESCE(public.mgmt_text(p_change_reason, 2000), change_reason), updated_at = now() WHERE id = p_revision_id;
END;
$fn$;

-- draft → in_review (exige al menos un paso) · in_review → draft (devolver con motivo).
CREATE OR REPLACE FUNCTION public.transition_procedure_revision(p_revision_id uuid, p_to text, p_comment text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r procedure_revisions%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text := public.mgmt_text(p_comment, 2000); v_prev uuid;
BEGIN
  SELECT * INTO r FROM procedure_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF r.status = 'draft' AND p_to = 'in_review' THEN
    IF NOT EXISTS (SELECT 1 FROM procedure_steps WHERE revision_id = r.id) THEN
      RAISE EXCEPTION 'El procedimiento necesita al menos un paso en la secuencia' USING ERRCODE = 'P0001';
    END IF;
    IF r.rev > 0 AND public.mgmt_text(r.change_reason) IS NULL THEN RAISE EXCEPTION 'Indica el motivo del cambio de la revisión' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_revisions SET status = 'in_review', submitted_by = v_uid, submitted_at = now(), returned_reason = NULL, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'draft' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué se devuelve' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_revisions SET status = 'draft', returned_reason = v_comment, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'approved' THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores aprueban procedimientos' USING ERRCODE = '42501'; END IF;
    IF v_uid = r.created_by OR v_uid = r.submitted_by THEN RAISE EXCEPTION 'Aprueba una persona distinta de quien redactó el procedimiento' USING ERRCODE = '42501'; END IF;
    SELECT id INTO v_prev FROM procedure_revisions WHERE procedure_id = r.procedure_id AND status = 'approved' AND id <> r.id;
    UPDATE procedure_revisions SET status = 'superseded', updated_at = now() WHERE id = v_prev;
    UPDATE procedure_revisions SET status = 'approved', approved_by = v_uid, approved_at = now(), updated_at = now() WHERE id = r.id;
    UPDATE procedure_revisions SET content_hash = public.procedure_revision_hash(r.id) WHERE id = r.id;
    UPDATE procedures SET current_revision_id = r.id, updated_at = now() WHERE id = r.procedure_id;
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', r.status, p_to USING ERRCODE = 'P0001';
  END IF;
  RETURN p_to;
END;
$fn$;

-- «Verificado en campo» (17.4.3): sobre la revisión aprobada, otra persona que quien aprobó, tras un walkdown.
CREATE OR REPLACE FUNCTION public.field_verify_procedure_revision(p_revision_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r procedure_revisions%ROWTYPE; v_role text; v_note text := public.mgmt_text(p_note, 4000);
BEGIN
  SELECT * INTO r FROM procedure_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'Solo se verifica en campo una revisión aprobada' USING ERRCODE = 'P0001'; END IF;
  IF r.field_verified_at IS NOT NULL THEN RAISE EXCEPTION 'La revisión ya fue verificada en campo' USING ERRCODE = 'P0001'; END IF;
  IF auth.uid() = r.approved_by THEN RAISE EXCEPTION 'Verifica en campo una persona distinta de quien aprobó' USING ERRCODE = '42501'; END IF;
  IF v_note IS NULL OR length(v_note) < 3 THEN RAISE EXCEPTION 'Describe el walkdown realizado' USING ERRCODE = '22023'; END IF;
  UPDATE procedure_revisions SET field_verified_by = auth.uid(), field_verified_at = now(), walkdown_note = v_note, updated_at = now() WHERE id = r.id;
END;
$fn$;

-- Nueva revisión: copia la aprobada vigente a un borrador rev+1 (una sola revisión abierta a la vez).
CREATE OR REPLACE FUNCTION public.new_procedure_revision(p_procedure_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE p procedures%ROWTYPE; v_role text; v_cur procedure_revisions%ROWTYPE; v_id uuid; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO p FROM procedures WHERE id = p_procedure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM procedure_revisions WHERE procedure_id = p.id AND status IN ('draft', 'in_review')) THEN
    RAISE EXCEPTION 'Ya hay una revisión abierta de %', p.number USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_cur FROM procedure_revisions WHERE id = p.current_revision_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'El procedimiento aún no tiene revisión aprobada' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la nueva revisión' USING ERRCODE = '22023'; END IF;
  INSERT INTO procedure_revisions (procedure_id, org_id, project_id, rev, sections, change_reason, created_by)
  VALUES (p.id, p.org_id, p.project_id, (SELECT MAX(rev) + 1 FROM procedure_revisions WHERE procedure_id = p.id), v_cur.sections, v_reason, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO procedure_steps (revision_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria)
  SELECT v_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria
  FROM procedure_steps WHERE revision_id = v_cur.id;
  RETURN v_id;
END;
$fn$;

-- Copiar un procedimiento de otro proyecto de la org como borrador R0 (los tags se emparejan por número).
CREATE OR REPLACE FUNCTION public.copy_procedure(p_source_procedure_id uuid, p_target_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE s procedures%ROWTYPE; v_src procedure_revisions%ROWTYPE; v_role text; v_new uuid; v_rev uuid;
BEGIN
  SELECT * INTO s FROM procedures WHERE id = p_source_procedure_id;
  IF NOT FOUND OR NOT public.is_project_member(s.project_id) THEN RAISE EXCEPTION 'Procedimiento de origen no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p_target_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_target_project_id AND org_id = s.org_id) THEN RAISE EXCEPTION 'El proyecto destino es de otra organización' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_src FROM procedure_revisions WHERE id = COALESCE(s.current_revision_id,
    (SELECT id FROM procedure_revisions WHERE procedure_id = s.id ORDER BY rev DESC LIMIT 1));
  v_new := public.create_procedure(p_target_project_id, s.title, s.kind, NULL);
  SELECT id INTO v_rev FROM procedure_revisions WHERE procedure_id = v_new AND rev = 0;
  UPDATE procedure_revisions SET sections = v_src.sections, change_reason = 'Copiado de ' || s.number WHERE id = v_rev;
  INSERT INTO procedure_steps (revision_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria)
  SELECT v_rev, p_target_project_id, st.ord, st.action, st.responsible, st.expected_value,
         (SELECT t2.id FROM tags t1 JOIN tags t2 ON t2.tag_number = t1.tag_number AND t2.project_id = p_target_project_id WHERE t1.id = st.tag_id LIMIT 1),
         st.is_hold_point, st.hold_capacity, st.stop_criteria
  FROM procedure_steps st WHERE st.revision_id = v_src.id;
  RETURN v_new;
END;
$fn$;

-- Borrar: solo procedimientos nunca aprobados y sin ejecuciones (quien lo creó u owner/admin).
CREATE OR REPLACE FUNCTION public.delete_procedure_draft(p_procedure_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE p procedures%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO p FROM procedures WHERE id = p_procedure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p.project_id);
  IF v_role IS NULL OR NOT (p.created_by = auth.uid() OR v_role IN ('owner', 'admin')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM procedure_revisions WHERE procedure_id = p.id AND approved_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM procedure_runs WHERE procedure_id = p.id) THEN
    RAISE EXCEPTION 'Solo se borran procedimientos nunca aprobados ni ejecutados' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM procedures WHERE id = p.id;
END;
$fn$;

-- ── 5. Ejecución ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_procedure_run(p_procedure_id uuid, p_system_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE p procedures%ROWTYPE; v_role text; v_rev procedure_revisions%ROWTYPE; v_sys uuid; v_seq integer; v_id uuid; v_n integer;
BEGIN
  SELECT * INTO p FROM procedures WHERE id = p_procedure_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_rev FROM procedure_revisions WHERE id = p.current_revision_id AND status = 'approved';
  IF v_rev.id IS NULL THEN RAISE EXCEPTION 'Solo se ejecuta una revisión aprobada' USING ERRCODE = 'P0001'; END IF;
  v_sys := COALESCE(p.system_id, p_system_id);
  IF p.system_id IS NOT NULL AND p_system_id IS NOT NULL AND p_system_id <> p.system_id THEN
    RAISE EXCEPTION 'Este procedimiento es del sistema asignado' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(p.project_id, p.org_id, v_sys, NULL);
  v_seq := public.mgmt_next_seq('procedure_runs', p.project_id);
  SELECT COUNT(*) + 1 INTO v_n FROM procedure_runs WHERE procedure_id = p.id;
  INSERT INTO procedure_runs (org_id, project_id, procedure_id, revision_id, system_id, seq, number, started_by)
  VALUES (p.org_id, p.project_id, p.id, v_rev.id, v_sys, v_seq, p.number || '-R' || v_rev.rev || '-E' || v_n, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO procedure_run_steps (run_id, step_id, project_id, ord)
  SELECT v_id, s.id, p.project_id, s.ord FROM procedure_steps s WHERE s.revision_id = v_rev.id;
  RETURN v_id;
END;
$fn$;

-- Marca un paso (o N/A con comentario). Orden estricto; un hold point deja la ejecución detenida.
CREATE OR REPLACE FUNCTION public.complete_run_step(p_run_id uuid, p_step_id uuid, p_actual text DEFAULT NULL, p_comment text DEFAULT NULL, p_na boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r procedure_runs%ROWTYPE; rs procedure_run_steps%ROWTYPE; st procedure_steps%ROWTYPE; v_role text; v_to text; v_comment text := public.mgmt_text(p_comment, 2000);
BEGIN
  SELECT * INTO r FROM procedure_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status = 'at_hold' THEN RAISE EXCEPTION 'La ejecución está detenida en un hold point: debe liberarse antes de seguir' USING ERRCODE = 'P0001'; END IF;
  IF r.status <> 'in_progress' THEN RAISE EXCEPTION 'La ejecución no está en curso (%)', r.status USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO rs FROM procedure_run_steps WHERE run_id = p_run_id AND step_id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paso no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF rs.status <> 'pending' THEN RAISE EXCEPTION 'El paso % ya fue registrado', rs.ord USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = p_run_id AND ord < rs.ord AND status NOT IN ('done', 'released', 'na')) THEN
    RAISE EXCEPTION 'Completa los pasos anteriores antes del paso %', rs.ord USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO st FROM procedure_steps WHERE id = p_step_id;
  IF p_na THEN
    IF st.is_hold_point THEN RAISE EXCEPTION 'Un hold point no puede marcarse N/A' USING ERRCODE = 'P0001'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué el paso no aplica' USING ERRCODE = '22023'; END IF;
    v_to := 'na';
  ELSIF st.is_hold_point THEN v_to := 'at_hold';
  ELSE v_to := 'done';
  END IF;
  UPDATE procedure_run_steps SET status = v_to, actual_value = public.mgmt_text(p_actual, 500), comment = v_comment, done_by = auth.uid(), done_at = now()
   WHERE run_id = p_run_id AND step_id = p_step_id;
  UPDATE procedure_runs SET status = CASE WHEN v_to = 'at_hold' THEN 'at_hold' ELSE status END, updated_at = now() WHERE id = p_run_id;
  RETURN v_to;
END;
$fn$;

-- Liberar un hold point: otra persona con rol habilitado para la capacidad del paso.
CREATE OR REPLACE FUNCTION public.release_hold_point(p_run_id uuid, p_step_id uuid, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r procedure_runs%ROWTYPE; rs procedure_run_steps%ROWTYPE; st procedure_steps%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM procedure_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  SELECT * INTO rs FROM procedure_run_steps WHERE run_id = p_run_id AND step_id = p_step_id FOR UPDATE;
  IF NOT FOUND OR rs.status <> 'at_hold' THEN RAISE EXCEPTION 'El paso no está esperando liberación' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO st FROM procedure_steps WHERE id = p_step_id;
  IF auth.uid() IS NULL OR v_role IS NULL OR NOT (v_role = ANY (public.hold_release_roles(st.hold_capacity))) THEN
    RAISE EXCEPTION 'Tu rol no puede liberar un hold point de %', st.hold_capacity USING ERRCODE = '42501';
  END IF;
  IF auth.uid() = rs.done_by THEN RAISE EXCEPTION 'Libera el hold point una persona distinta de quien ejecutó el paso' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('at_hold', 'stopped') THEN RAISE EXCEPTION 'La ejecución no está detenida en un hold point' USING ERRCODE = 'P0001'; END IF;
  UPDATE procedure_run_steps SET status = 'released', released_by = auth.uid(), released_at = now(), release_role = st.hold_capacity,
         comment = COALESCE(public.mgmt_text(p_comment, 2000), comment)
   WHERE run_id = p_run_id AND step_id = p_step_id;
  UPDATE procedure_runs SET status = CASE WHEN status = 'at_hold' THEN 'in_progress' ELSE status END, updated_at = now() WHERE id = p_run_id;
END;
$fn$;

-- Detener (criterio de parada) · reanudar · completar · abortar.
CREATE OR REPLACE FUNCTION public.transition_procedure_run(p_run_id uuid, p_to text, p_comment text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r procedure_runs%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text := public.mgmt_text(p_comment, 2000);
BEGIN
  SELECT * INTO r FROM procedure_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF p_to = 'stopped' AND r.status IN ('in_progress', 'at_hold') THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica qué criterio de parada se cumplió' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_runs SET status = 'stopped', stopped_by = v_uid, stopped_at = now(), stop_reason = v_comment, updated_at = now() WHERE id = r.id;
  ELSIF p_to = 'in_progress' AND r.status = 'stopped' THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores reanudan una ejecución detenida' USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué es seguro reanudar' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_runs SET status = CASE WHEN EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = r.id AND status = 'at_hold') THEN 'at_hold' ELSE 'in_progress' END,
           stop_reason = stop_reason || ' · Reanudado: ' || v_comment, updated_at = now() WHERE id = r.id;
  ELSIF p_to = 'completed' AND r.status = 'in_progress' THEN
    IF EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = r.id AND status NOT IN ('done', 'released', 'na')) THEN
      RAISE EXCEPTION 'Quedan pasos sin completar o hold points sin liberar' USING ERRCODE = 'P0001';
    END IF;
    UPDATE procedure_runs SET status = 'completed', completed_by = v_uid, completed_at = now(), updated_at = now() WHERE id = r.id;
  ELSIF p_to = 'aborted' AND r.status IN ('in_progress', 'at_hold', 'stopped') THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores abortan una ejecución' USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_runs SET status = 'aborted', aborted_by = v_uid, aborted_at = now(), abort_reason = v_comment, updated_at = now() WHERE id = r.id;
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', r.status, p_to USING ERRCODE = 'P0001';
  END IF;
  RETURN p_to;
END;
$fn$;

-- ── 6. Line-ups ──────────────────────────────────────────────────────────
-- Crea la hoja; con p_generate agrega una fila por tag del sistema de categoría «Válvulas»
-- (ESD/bloqueo/alivio quedan marcadas críticas).
CREATE OR REPLACE FUNCTION public.create_lineup_sheet(
  p_project_id uuid, p_system_id uuid, p_title text, p_purpose text DEFAULT 'startup', p_procedure_id uuid DEFAULT NULL, p_generate boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_system_id IS NULL THEN RAISE EXCEPTION 'El line-up necesita un sistema' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, NULL);
  IF p_procedure_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM procedures WHERE id = p_procedure_id AND project_id = p_project_id) THEN
    RAISE EXCEPTION 'El procedimiento no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  v_seq := public.mgmt_next_seq('lineup_sheets', p_project_id);
  INSERT INTO lineup_sheets (org_id, project_id, seq, number, system_id, title, purpose, procedure_id, created_by)
  VALUES (v_org, p_project_id, v_seq, 'LU-' || lpad(v_seq::text, 4, '0'), p_system_id, public.mgmt_text(p_title, 200), COALESCE(p_purpose, 'startup'), p_procedure_id, auth.uid())
  RETURNING id INTO v_id;
  IF COALESCE(p_generate, true) THEN
    INSERT INTO lineup_items (sheet_id, project_id, ord, tag_id, is_critical)
    SELECT v_id, p_project_id, row_number() OVER (ORDER BY t.tag_number), t.id,
           et.code IN ('ESDV', 'XV', 'SDV', 'BDV', 'PSV', 'HV-ESD')
    FROM tags t JOIN subsystems ss ON ss.id = t.subsystem_id
    JOIN equipment_types et ON et.id = t.equipment_type_id
    WHERE ss.system_id = p_system_id AND t.project_id = p_project_id AND lower(et.category) LIKE 'v_lvula%';
  END IF;
  RETURN v_id;
END;
$fn$;

-- Reemplaza las filas de una hoja en borrador: [{tag_id?, label?, required_position, required_note?, is_critical}]
CREATE OR REPLACE FUNCTION public.save_lineup_items(p_sheet_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE s lineup_sheets%ROWTYPE; v_role text; e jsonb; i integer := 0;
BEGIN
  SELECT * INTO s FROM lineup_sheets WHERE id = p_sheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hoja no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status <> 'draft' THEN RAISE EXCEPTION 'Solo se editan hojas en borrador' USING ERRCODE = 'P0001'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 1000 THEN RAISE EXCEPTION 'Filas no válidas' USING ERRCODE = '22023'; END IF;
  DELETE FROM lineup_items WHERE sheet_id = s.id;
  FOR e IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    i := i + 1;
    IF NULLIF(e ->> 'tag_id', '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tags WHERE id = (e ->> 'tag_id')::uuid AND project_id = s.project_id) THEN
      RAISE EXCEPTION 'El tag de la fila % no pertenece al proyecto', i USING ERRCODE = '22023';
    END IF;
    INSERT INTO lineup_items (sheet_id, project_id, ord, tag_id, label, required_position, required_note, is_critical)
    VALUES (s.id, s.project_id, i, NULLIF(e ->> 'tag_id', '')::uuid, public.mgmt_text(e ->> 'label', 200), NULLIF(e ->> 'required_position', ''),
            public.mgmt_text(e ->> 'required_note', 500), COALESCE((e ->> 'is_critical')::boolean, false));
  END LOOP;
  UPDATE lineup_sheets SET updated_at = now() WHERE id = s.id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.issue_lineup_sheet(p_sheet_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE s lineup_sheets%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO s FROM lineup_sheets WHERE id = p_sheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hoja no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status <> 'draft' THEN RAISE EXCEPTION 'La hoja ya fue emitida' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM lineup_items WHERE sheet_id = s.id) THEN RAISE EXCEPTION 'La hoja no tiene filas' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM lineup_items WHERE sheet_id = s.id AND required_position IS NULL) THEN
    RAISE EXCEPTION 'Todas las filas necesitan su posición requerida' USING ERRCODE = 'P0001';
  END IF;
  UPDATE lineup_sheets SET status = 'issued', issued_by = auth.uid(), issued_at = now(), updated_at = now() WHERE id = s.id;
END;
$fn$;

-- Registrar la posición encontrada/fijada (re-fijar borra la verificación previa de la fila).
CREATE OR REPLACE FUNCTION public.set_lineup_item(p_item_id uuid, p_found text, p_remarks text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE it lineup_items%ROWTYPE; s lineup_sheets%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO it FROM lineup_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fila no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM lineup_sheets WHERE id = it.sheet_id FOR UPDATE;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status NOT IN ('issued', 'in_progress') THEN RAISE EXCEPTION 'La hoja no está en ejecución' USING ERRCODE = 'P0001'; END IF;
  IF p_found IS NULL THEN RAISE EXCEPTION 'Indica la posición encontrada' USING ERRCODE = '22023'; END IF;
  UPDATE lineup_items SET found_position = p_found, remarks = public.mgmt_text(p_remarks, 1000), set_by = auth.uid(), set_at = now(),
         verified_by = NULL, verified_at = NULL WHERE id = it.id;
  UPDATE lineup_sheets SET status = 'in_progress', updated_at = now() WHERE id = s.id AND status = 'issued';
END;
$fn$;

-- Verificación independiente: otra persona; la posición debe coincidir con la requerida.
CREATE OR REPLACE FUNCTION public.verify_lineup_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE it lineup_items%ROWTYPE; s lineup_sheets%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO it FROM lineup_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fila no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM lineup_sheets WHERE id = it.sheet_id;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status NOT IN ('issued', 'in_progress') THEN RAISE EXCEPTION 'La hoja no está en ejecución' USING ERRCODE = 'P0001'; END IF;
  IF it.set_at IS NULL THEN RAISE EXCEPTION 'Primero registra la posición de la fila' USING ERRCODE = 'P0001'; END IF;
  IF it.set_by = auth.uid() THEN RAISE EXCEPTION 'La verificación independiente la hace otra persona' USING ERRCODE = '42501'; END IF;
  IF it.found_position IS DISTINCT FROM it.required_position THEN
    RAISE EXCEPTION 'La posición encontrada no es la requerida: corrígela antes de verificar' USING ERRCODE = 'P0001';
  END IF;
  UPDATE lineup_items SET verified_by = auth.uid(), verified_at = now() WHERE id = it.id;
END;
$fn$;

-- Completar: todas las filas en la posición requerida y las críticas verificadas. Reemplaza verificadas previas.
CREATE OR REPLACE FUNCTION public.complete_lineup_sheet(p_sheet_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE s lineup_sheets%ROWTYPE; v_role text; v_bad integer; v_hash text;
BEGIN
  SELECT * INTO s FROM lineup_sheets WHERE id = p_sheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hoja no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status <> 'in_progress' THEN RAISE EXCEPTION 'La hoja no está en ejecución' USING ERRCODE = 'P0001'; END IF;
  SELECT COUNT(*) INTO v_bad FROM lineup_items WHERE sheet_id = s.id
     AND (found_position IS DISTINCT FROM required_position OR (is_critical AND verified_at IS NULL));
  IF v_bad > 0 THEN RAISE EXCEPTION '% fila(s) sin alinear o críticas sin verificar', v_bad USING ERRCODE = 'P0001'; END IF;
  UPDATE lineup_sheets SET status = 'superseded', superseded_at = now(), updated_at = now()
   WHERE system_id = s.system_id AND purpose = s.purpose AND status = 'verified' AND id <> s.id;
  v_hash := encode(sha256(convert_to(jsonb_build_object('number', s.number, 'system', s.system_id, 'items',
              (SELECT jsonb_agg(jsonb_build_object('ord', ord, 'tag', tag_id, 'label', label, 'req', required_position, 'found', found_position,
                 'critical', is_critical, 'set_by', set_by, 'set_at', set_at, 'verified_by', verified_by, 'verified_at', verified_at) ORDER BY ord)
               FROM lineup_items WHERE sheet_id = s.id))::text, 'UTF8')), 'hex');
  UPDATE lineup_sheets SET status = 'verified', verified_by = auth.uid(), verified_at = now(), content_hash = v_hash, updated_at = now() WHERE id = s.id;
  RETURN v_hash;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_lineup_sheet_draft(p_sheet_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE s lineup_sheets%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO s FROM lineup_sheets WHERE id = p_sheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hoja no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(s.project_id);
  IF v_role IS NULL OR NOT (s.created_by = auth.uid() OR v_role IN ('owner', 'admin')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status <> 'draft' THEN RAISE EXCEPTION 'Solo se borran hojas en borrador' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM lineup_sheets WHERE id = s.id;
END;
$fn$;

-- Hoja verificada vigente: no reemplazada y sin cambios de estado de registros F3 del sistema después.
CREATE OR REPLACE FUNCTION public.lineup_is_stale(p_sheet_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM lineup_sheets s
    JOIN register_items ri ON ri.project_id = s.project_id
    JOIN register_events e ON e.item_id = ri.id AND e.action = 'transition' AND e.created_at > s.verified_at
    WHERE s.id = p_sheet_id AND s.verified_at IS NOT NULL
      AND ri.kind IN ('blind', 'bypass', 'temporary', 'energization', 'reinstatement')
      AND (ri.system_id = s.system_id OR EXISTS (
            SELECT 1 FROM register_item_tags rit JOIN tags t ON t.id = rit.tag_id JOIN subsystems ss ON ss.id = t.subsystem_id
            WHERE rit.item_id = ri.id AND ss.system_id = s.system_id)));
$fn$;

-- ── 7. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.hold_release_roles(text)                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.procedure_section_keys()                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.procedure_revision_hash(uuid)                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.procedure_write_content(procedure_revisions, jsonb, jsonb)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_procedure(uuid, text, text, uuid)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_procedure(uuid, text, text, uuid)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_procedure_revision(uuid, jsonb, jsonb, text)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_procedure_revision(uuid, text, text)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.field_verify_procedure_revision(uuid, text)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.new_procedure_revision(uuid, text)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copy_procedure(uuid, uuid)                                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_procedure_draft(uuid)                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_procedure_run(uuid, uuid)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_run_step(uuid, uuid, text, text, boolean)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_hold_point(uuid, uuid, text)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_procedure_run(uuid, text, text)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_lineup_sheet(uuid, uuid, text, text, uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_lineup_items(uuid, jsonb)                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.issue_lineup_sheet(uuid)                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_lineup_item(uuid, text, text)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_lineup_item(uuid)                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_lineup_sheet(uuid)                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_lineup_sheet_draft(uuid)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.lineup_is_stale(uuid)                                      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hold_release_roles(text)                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.procedure_section_keys()                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_procedure(uuid, text, text, uuid)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_procedure(uuid, text, text, uuid)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_procedure_revision(uuid, jsonb, jsonb, text)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_procedure_revision(uuid, text, text)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.field_verify_procedure_revision(uuid, text)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.new_procedure_revision(uuid, text)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copy_procedure(uuid, uuid)                                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_procedure_draft(uuid)                                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_procedure_run(uuid, uuid)                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_step(uuid, uuid, text, text, boolean)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_hold_point(uuid, uuid, text)                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_procedure_run(uuid, text, text)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_lineup_sheet(uuid, uuid, text, text, uuid, boolean)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_lineup_items(uuid, jsonb)                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_lineup_sheet(uuid)                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_lineup_item(uuid, text, text)                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_lineup_item(uuid)                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_lineup_sheet(uuid)                                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_lineup_sheet_draft(uuid)                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lineup_is_stale(uuid)                                       TO authenticated, service_role;

-- ── 8. Motor de gates: criterio implícito lineup_verified ───────────────
CREATE OR REPLACE FUNCTION public.compute_system_gates(p_system_id uuid)
RETURNS TABLE(
  gate_id             uuid,
  gate_code           text,
  gate_name           text,
  gate_order          integer,
  gate_phase_id       uuid,
  requires_previous   boolean,
  approval_roles      text[],
  required_signatures text[],
  cosign_roles        text[],
  computed_level      text,
  status              text,
  criteria            jsonb,
  approval            jsonb
)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_org     uuid;
  v_limit   integer;
  v_prev_ok boolean := true;
  v_first   boolean := true;
  g         record;
  c         record;
  v_phase   uuid;
  v_crit    jsonb;
  v_res     jsonb;
  v_result  text;
  v_level   text;
  v_appr    jsonb;
  v_levels  text[];
  v_total   integer;
  v_fail    jsonb;
  v_failn   integer;
BEGIN
  SELECT p.org_id INTO v_org
  FROM systems s JOIN projects p ON p.id = s.project_id
  WHERE s.id = p_system_id;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  v_limit := public.org_cat_b_limit(v_org);

  FOR g IN
    SELECT rg.* FROM readiness_gates rg
    WHERE rg.org_id = v_org AND rg.is_active
    ORDER BY rg.order_index, rg.code
  LOOP
    v_crit  := '[]'::jsonb;
    v_level := 'green';

    IF g.requires_previous AND NOT v_first THEN
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'previous_gate', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_prev_ok THEN 'pass' ELSE 'fail' END, 'detail', '{}'::jsonb));
      IF NOT v_prev_ok THEN v_level := 'red'; END IF;
    END IF;

    -- Dependencias entre sistemas (F2): criterio implícito y siempre bloqueante. El proveedor
    -- cumple si su gate requerido tiene una aprobación vigente con todas las firmas.
    SELECT COUNT(*)::int,
           COUNT(*) FILTER (WHERE NOT x.ok)::int,
           COALESCE(jsonb_agg(jsonb_build_object(
             'dependency_id', x.dep_id, 'kind', x.kind,
             'system_id', x.sys_id, 'system_code', x.sys_code, 'system_name', x.sys_name,
             'gate_id', x.gate_id, 'gate_code', x.gate_code,
             'provider_status', x.appr_status, 'ok', x.ok) ORDER BY x.ok, x.sys_code), '[]'::jsonb)
      INTO v_total, v_failn, v_fail
    FROM (
      SELECT d.id AS dep_id, d.kind, ps.id AS sys_id, ps.code AS sys_code, ps.name AS sys_name,
             rg.id AS gate_id, rg.code AS gate_code, sa.status AS appr_status,
             COALESCE(sa.status IN ('approved', 'approved_with_conditions'), false) AS ok
      FROM system_dependencies d
      JOIN systems ps         ON ps.id = d.depends_on_system_id
      JOIN readiness_gates rg ON rg.id = d.required_gate_id AND rg.is_active
      LEFT JOIN system_gate_approvals sa
             ON sa.system_id = ps.id AND sa.gate_id = rg.id AND sa.revoked_at IS NULL
      WHERE d.system_id = p_system_id AND d.blocked_gate_id = g.id
    ) x;
    IF v_total > 0 THEN
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'dependencies_ready', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_failn = 0 THEN 'pass' ELSE 'fail' END,
        'detail', jsonb_build_object('total', v_total, 'missing_count', v_failn, 'dependencies', v_fail)));
      IF v_failn > 0 THEN v_level := 'red'; END IF;
    END IF;

    -- Registros controlados (F3): criterio implícito si algún tipo activo bloquea este gate.
    -- Bloquea todo ítem no verificado ni cancelado del sistema (por system_id o por sus tags).
    IF EXISTS (SELECT 1 FROM register_types rt WHERE rt.org_id = v_org AND rt.is_active AND rt.blocks_gate_id = g.id) THEN
      SELECT COUNT(*)::int,
             COALESCE(jsonb_agg(jsonb_build_object(
               'id', ri.id, 'number', ri.number, 'kind', ri.kind, 'status', ri.status, 'title', ri.title
             ) ORDER BY ri.number), '[]'::jsonb)
        INTO v_failn, v_fail
      FROM register_items ri
      JOIN register_types rt ON rt.id = ri.type_id AND rt.is_active AND rt.blocks_gate_id = g.id
      WHERE ri.status IN ('proposed', 'authorized', 'active', 'removed')
        AND (ri.system_id = p_system_id OR EXISTS (
              SELECT 1 FROM register_item_tags rit
              JOIN tags t ON t.id = rit.tag_id
              JOIN subsystems ss ON ss.id = t.subsystem_id
              WHERE rit.item_id = ri.id AND ss.system_id = p_system_id));
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'registers_clear', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_failn = 0 THEN 'pass' ELSE 'fail' END,
        'detail', jsonb_build_object('open_count', v_failn, 'open', v_fail)));
      IF v_failn > 0 THEN v_level := 'red'; END IF;
    END IF;

    -- Restricciones (F5): criterio implícito si el sistema tiene restricciones no cerradas asignadas a
    -- este gate. Deja el gate «con condiciones» (warn); una restricción ABIERTA de nivel 4 lo bloquea.
    SELECT COUNT(*)::int,
           COUNT(*) FILTER (WHERE pc.status = 'open' AND pc.escalation_level = 4)::int,
           COALESCE(jsonb_agg(jsonb_build_object(
             'id', pc.id, 'number', pc.number, 'title', pc.title, 'status', pc.status,
             'level', pc.escalation_level, 'need_date', pc.need_date
           ) ORDER BY pc.escalation_level DESC, pc.number), '[]'::jsonb)
      INTO v_total, v_failn, v_fail
    FROM project_constraints pc
    WHERE pc.system_id = p_system_id AND pc.gate_id = g.id AND pc.status IN ('open', 'resolved');
    IF v_total > 0 THEN
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'constraints_clear', 'label', NULL, 'blocking', v_failn > 0,
        'result', CASE WHEN v_failn > 0 THEN 'fail' ELSE 'warn' END,
        'detail', jsonb_build_object('open_count', v_total, 'blocking_count', v_failn, 'open', v_fail)));
      IF v_failn > 0 THEN
        v_level := 'red';
      ELSIF v_level = 'green' THEN
        v_level := 'yellow';
      END IF;
    END IF;

    -- Line-up (F6): criterio implícito y bloqueante si el gate lo exige. Cumple con una hoja del sistema
    -- verificada, no reemplazada y sin cambios de estado de registros F3 del sistema posteriores.
    IF g.requires_lineup THEN
      SELECT jsonb_build_object('id', ls.id, 'number', ls.number, 'verified_at', ls.verified_at, 'stale', public.lineup_is_stale(ls.id))
        INTO v_res
      FROM lineup_sheets ls
      WHERE ls.system_id = p_system_id AND ls.status = 'verified'
      ORDER BY public.lineup_is_stale(ls.id), ls.verified_at DESC
      LIMIT 1;
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'lineup_verified', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_res IS NOT NULL AND NOT (v_res ->> 'stale')::boolean THEN 'pass' ELSE 'fail' END,
        'detail', COALESCE(v_res, jsonb_build_object('missing', true))));
      IF v_res IS NULL OR (v_res ->> 'stale')::boolean THEN v_level := 'red'; END IF;
    END IF;

    FOR c IN
      SELECT gc.* FROM gate_criteria gc WHERE gc.gate_id = g.id ORDER BY gc.order_index, gc.created_at
    LOOP
      v_phase := COALESCE(NULLIF(c.params ->> 'phase_id', '')::uuid, g.phase_id);
      v_res   := '{}'::jsonb;
      v_result := 'fail';

      IF c.kind = 'itr_phase_approved' THEN
        IF v_phase IS NULL THEN
          v_res := jsonb_build_object('error', 'no_phase');
        ELSE
          v_res := public.system_phase_level(p_system_id, v_phase, v_limit);
          v_result := CASE v_res ->> 'level' WHEN 'green' THEN 'pass' WHEN 'yellow' THEN 'warn' ELSE 'fail' END;
        END IF;

      ELSIF c.kind = 'certificates_issued' THEN
        IF v_phase IS NULL THEN
          v_res := jsonb_build_object('error', 'no_phase');
        ELSE
          SELECT COUNT(*)::int,
                 COUNT(*) FILTER (WHERE NOT EXISTS (
                   SELECT 1 FROM certificates ce
                   WHERE ce.subsystem_id = ss.id AND ce.phase_id = v_phase AND ce.status = 'issued'))::int,
                 COALESCE(jsonb_agg(jsonb_build_object('id', ss.id, 'code', ss.code) ORDER BY ss.code)
                   FILTER (WHERE NOT EXISTS (
                     SELECT 1 FROM certificates ce
                     WHERE ce.subsystem_id = ss.id AND ce.phase_id = v_phase AND ce.status = 'issued')), '[]'::jsonb)
            INTO v_total, v_failn, v_fail
          FROM subsystems ss WHERE ss.system_id = p_system_id;
          v_res := jsonb_build_object('subsystems_total', v_total, 'missing_count', v_failn, 'missing', v_fail);
          v_result := CASE WHEN v_total > 0 AND v_failn = 0 THEN 'pass' ELSE 'fail' END;
        END IF;

      ELSIF c.kind = 'pssr_approved' THEN
        SELECT jsonb_build_object('review_id', pr.id, 'review_number', pr.review_number, 'review_status', pr.status)
          INTO v_res
        FROM pssr_reviews pr
        WHERE pr.system_id = p_system_id
        ORDER BY (pr.status = 'approved') DESC, pr.created_at DESC
        LIMIT 1;
        v_res := COALESCE(v_res, '{}'::jsonb);
        v_result := CASE WHEN v_res ->> 'review_status' = 'approved' THEN 'pass' ELSE 'fail' END;

      ELSIF c.kind = 'critical_tags_ready' THEN
        SELECT COALESCE(array_agg(x), ARRAY['safety', 'process'])
          INTO v_levels
        FROM jsonb_array_elements_text(COALESCE(c.params -> 'levels', '[]'::jsonb)) x;

        WITH crit AS (
          SELECT t.id, t.tag_number, t.criticality
          FROM tags t JOIN subsystems ss ON ss.id = t.subsystem_id
          WHERE ss.system_id = p_system_id AND t.criticality = ANY (v_levels)
        ),
        chk AS (
          SELECT crit.*,
                 (SELECT COUNT(*) FROM itrs i
                   WHERE i.tag_id = crit.id AND i.status <> 'approved'
                     AND (v_phase IS NULL OR i.phase_id = v_phase)) AS itrs_pending,
                 (SELECT COUNT(*) FROM punches p
                   WHERE p.tag_id = crit.id AND p.category IN ('A', 'B')
                     AND p.status IN ('open', 'in_progress')) AS punches_open
          FROM crit
        )
        SELECT COUNT(*)::int,
               COUNT(*) FILTER (WHERE itrs_pending > 0 OR punches_open > 0)::int,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'id', id, 'tag_number', tag_number, 'criticality', criticality,
                 'itrs_pending', itrs_pending, 'punches_open', punches_open) ORDER BY tag_number)
                 FILTER (WHERE itrs_pending > 0 OR punches_open > 0), '[]'::jsonb)
          INTO v_total, v_failn, v_fail
        FROM chk;
        v_res := jsonb_build_object('critical_total', v_total, 'failing_count', v_failn,
                                    'failing', v_fail, 'levels', to_jsonb(v_levels));
        v_result := CASE WHEN v_failn = 0 THEN 'pass' ELSE 'fail' END;

      ELSIF c.kind = 'manual_attestation' THEN
        SELECT jsonb_build_object('attestation_id', a.id, 'comment', a.comment, 'file_path', a.file_path,
                                  'attested_by', a.attested_by, 'attested_at', a.attested_at)
          INTO v_res
        FROM system_gate_attestations a
        WHERE a.system_id = p_system_id AND a.criterion_id = c.id AND a.revoked_at IS NULL;
        v_result := CASE WHEN v_res IS NULL THEN 'fail' ELSE 'pass' END;
        v_res := COALESCE(v_res, '{}'::jsonb);
      END IF;

      IF v_result = 'fail' AND NOT c.is_blocking THEN
        v_result := 'warn';
      END IF;

      IF v_result = 'fail' THEN
        v_level := 'red';
      ELSIF v_result = 'warn' AND v_level = 'green' THEN
        v_level := 'yellow';
      END IF;

      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', c.id, 'kind', c.kind, 'label', c.params ->> 'label',
        'blocking', c.is_blocking, 'result', v_result, 'detail', v_res));
    END LOOP;

    SELECT jsonb_build_object(
             'id', a.id, 'status', a.status, 'target_status', a.target_status,
             'conditions', a.conditions, 'notes', a.notes,
             'approved_by', a.approved_by, 'approved_role', a.approved_role, 'approved_at', a.approved_at,
             'signatures', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'capacity', s.capacity, 'user_id', s.user_id, 'user_role', s.user_role,
                        'comments', s.comments, 'signed_at', s.signed_at) ORDER BY s.signed_at)
               FROM system_gate_signatures s WHERE s.approval_id = a.id), '[]'::jsonb))
      INTO v_appr
    FROM system_gate_approvals a
    WHERE a.system_id = p_system_id AND a.gate_id = g.id AND a.revoked_at IS NULL;

    gate_id             := g.id;
    gate_code           := g.code;
    gate_name           := g.name;
    gate_order          := g.order_index;
    gate_phase_id       := g.phase_id;
    requires_previous   := g.requires_previous;
    approval_roles      := g.approval_roles;
    required_signatures := g.required_signatures;
    cosign_roles        := g.cosign_roles;
    computed_level      := v_level;
    criteria            := v_crit;
    approval            := v_appr;
    status := CASE
      WHEN v_appr IS NOT NULL AND v_level = 'red' THEN 'regressed'
      WHEN v_appr IS NOT NULL THEN v_appr ->> 'status'
      WHEN v_level = 'green'  THEN 'ready'
      WHEN v_level = 'yellow' THEN 'ready_with_conditions'
      ELSE 'not_ready'
    END;
    RETURN NEXT;

    -- Solo un gate con todas sus firmas habilita al siguiente.
    v_prev_ok := v_appr IS NOT NULL AND v_appr ->> 'status' <> 'pending_signatures';
    v_first   := false;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_system_gates(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.compute_system_gates(uuid) TO authenticated, service_role;

-- ── 9. Mi trabajo: hold points por liberar y filas críticas por verificar ──
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
    )
  );
$function$;
