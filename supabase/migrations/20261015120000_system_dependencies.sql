-- Fase 2 del plan readiness — sistematización (2026-10-15, decisiones de Luis):
--   systems: tipo (proceso/utility/seguridad), prioridad P1–P5, límites de batería estructurados y
--            congelamiento de límites INFORMATIVO (se registra quién/cuándo y los cambios posteriores
--            de subsistemas/tags quedan en activity_log; no bloquea).
--   system_dependencies: «el sistema A necesita que B tenga aprobado el gate X antes del gate Y de A».
--            Por fila, con valores por defecto por tipo resueltos en la app (src/lib/systems/dependencies.ts).
--            Sin ciclos a nivel de sistema.
--   compute_system_gates: criterio implícito `dependencies_ready` (como previous_gate) en cada gate que
--            tenga dependencias; si el proveedor revoca, el dependiente aprobado queda 'regressed'.
-- «Habilitante» no se guarda: un sistema lo es si otros dependen de él.

-- ── 1. Atributos del sistema ─────────────────────────────────────────────
ALTER TABLE public.systems
  ADD COLUMN system_type        text,
  ADD COLUMN priority           smallint,
  ADD COLUMN battery_limits     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN boundary_frozen_at timestamptz,
  ADD COLUMN boundary_frozen_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT systems_system_type_check CHECK (system_type IS NULL OR system_type IN ('process', 'utility', 'safety')),
  ADD CONSTRAINT systems_priority_check CHECK (priority IS NULL OR priority BETWEEN 1 AND 5),
  ADD CONSTRAINT systems_battery_limits_check CHECK (
    jsonb_typeof(battery_limits) = 'object'
    AND battery_limits - ARRAY['inlet', 'outlet', 'electrical', 'instrumentation', 'utilities', 'notes'] = '{}'::jsonb);

-- ── 2. Dependencias ──────────────────────────────────────────────────────
CREATE TABLE public.system_dependencies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id           uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_id            uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  depends_on_system_id uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  kind                 text NOT NULL DEFAULT 'utility',
  required_gate_id     uuid NOT NULL REFERENCES public.readiness_gates(id) ON DELETE CASCADE,
  blocked_gate_id      uuid NOT NULL REFERENCES public.readiness_gates(id) ON DELETE CASCADE,
  notes                text,
  source               text NOT NULL DEFAULT 'manual',
  created_by           uuid DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_dependencies_kind_check CHECK (kind IN ('utility', 'process', 'other')),
  CONSTRAINT system_dependencies_source_check CHECK (source IN ('manual', 'import', 'ai')),
  CONSTRAINT system_dependencies_not_self CHECK (system_id <> depends_on_system_id),
  CONSTRAINT system_dependencies_notes_len CHECK (notes IS NULL OR length(notes) <= 1000),
  CONSTRAINT system_dependencies_uq UNIQUE (system_id, depends_on_system_id, blocked_gate_id)
);
CREATE INDEX system_dependencies_system_gate_idx ON public.system_dependencies (system_id, blocked_gate_id);
CREATE INDEX system_dependencies_provider_idx    ON public.system_dependencies (depends_on_system_id);
CREATE INDEX system_dependencies_project_idx     ON public.system_dependencies (project_id);

ALTER TABLE public.system_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_dependencies_select ON public.system_dependencies FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY system_dependencies_insert ON public.system_dependencies FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));
CREATE POLICY system_dependencies_update ON public.system_dependencies FOR UPDATE TO authenticated
  USING (project_id IN (SELECT public.get_my_editor_project_ids()))
  WITH CHECK (project_id IN (SELECT public.get_my_editor_project_ids()));
CREATE POLICY system_dependencies_delete ON public.system_dependencies FOR DELETE TO authenticated
  USING (project_id IN (SELECT public.get_my_editor_project_ids()));

-- Coherencia: org/proyecto se derivan del sistema (no se confía en el cliente), ambos sistemas
-- en el mismo proyecto, gates de la org del proyecto y sin ciclos.
CREATE OR REPLACE FUNCTION public.guard_system_dependency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_project uuid; v_org uuid; v_other uuid;
BEGIN
  SELECT s.project_id, p.org_id INTO v_project, v_org
  FROM systems s JOIN projects p ON p.id = s.project_id WHERE s.id = NEW.system_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT project_id INTO v_other FROM systems WHERE id = NEW.depends_on_system_id;
  IF v_other IS DISTINCT FROM v_project THEN
    RAISE EXCEPTION 'Los dos sistemas deben ser del mismo proyecto' USING ERRCODE = '22023';
  END IF;
  IF (SELECT COUNT(*) FROM readiness_gates WHERE org_id = v_org AND id IN (NEW.required_gate_id, NEW.blocked_gate_id))
     <> (CASE WHEN NEW.required_gate_id = NEW.blocked_gate_id THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION 'Gate de otra organización' USING ERRCODE = '22023';
  END IF;
  NEW.project_id := v_project;
  NEW.org_id     := v_org;
  NEW.notes      := NULLIF(btrim(COALESCE(NEW.notes, '')), '');

  -- Serializa las altas del proyecto para que dos inserciones simultáneas no cierren un ciclo.
  PERFORM pg_advisory_xact_lock(hashtext('system_dependencies:' || v_project::text));
  IF EXISTS (
    WITH RECURSIVE up(sid) AS (
      SELECT NEW.depends_on_system_id
      UNION
      SELECT d.depends_on_system_id FROM system_dependencies d JOIN up ON d.system_id = up.sid
      WHERE d.id IS DISTINCT FROM NEW.id
    )
    SELECT 1 FROM up WHERE sid = NEW.system_id
  ) THEN
    RAISE EXCEPTION 'La dependencia crea un ciclo entre sistemas' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER system_dependencies_guard
  BEFORE INSERT OR UPDATE ON public.system_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.guard_system_dependency();

-- ── 3. Congelamiento informativo de límites ──────────────────────────────
-- Quién congela lo fija la BD; los cambios de alcance de un sistema congelado quedan auditados.
CREATE OR REPLACE FUNCTION public.track_system_boundary()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_org uuid;
BEGIN
  IF NEW.boundary_frozen_at IS DISTINCT FROM OLD.boundary_frozen_at THEN
    NEW.boundary_frozen_by := CASE WHEN NEW.boundary_frozen_at IS NULL THEN NULL ELSE auth.uid() END;
    SELECT org_id INTO v_org FROM projects WHERE id = NEW.project_id;
    -- activity_log.user_id es NOT NULL: los scripts con service role no dejan rastro aquí.
    IF auth.uid() IS NOT NULL THEN
    INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
    VALUES (v_org, auth.uid(), 'system', NEW.id,
            CASE WHEN NEW.boundary_frozen_at IS NULL THEN 'boundary_unfrozen' ELSE 'boundary_frozen' END,
            jsonb_build_object('project_id', NEW.project_id, 'system_code', NEW.code));
    END IF;
  ELSIF NEW.boundary_frozen_by IS DISTINCT FROM OLD.boundary_frozen_by THEN
    NEW.boundary_frozen_by := OLD.boundary_frozen_by;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER systems_boundary_track
  BEFORE UPDATE ON public.systems
  FOR EACH ROW EXECUTE FUNCTION public.track_system_boundary();

-- Alta/baja/movimiento de subsistemas y tags que toca un sistema congelado → activity_log.
CREATE OR REPLACE FUNCTION public.log_frozen_boundary_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_systems uuid[];
  v_sid     uuid;
  v_sys     record;
  v_entity  text := CASE TG_TABLE_NAME WHEN 'tags' THEN 'tag' ELSE 'subsystem' END;
  v_row     jsonb := to_jsonb(COALESCE(NEW, OLD));
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF; -- service role / scripts: activity_log exige usuario
  IF TG_TABLE_NAME = 'subsystems' THEN
    v_systems := ARRAY[CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.system_id END,
                       CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.system_id END];
  ELSE
    v_systems := ARRAY[
      (SELECT system_id FROM subsystems WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.subsystem_id END),
      (SELECT system_id FROM subsystems WHERE id = CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.subsystem_id END)];
  END IF;

  FOREACH v_sid IN ARRAY v_systems LOOP
    CONTINUE WHEN v_sid IS NULL;
    SELECT s.id, s.code, s.project_id, p.org_id INTO v_sys
    FROM systems s JOIN projects p ON p.id = s.project_id
    WHERE s.id = v_sid AND s.boundary_frozen_at IS NOT NULL;
    CONTINUE WHEN NOT FOUND;
    INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
    VALUES (v_sys.org_id, auth.uid(), 'system', v_sys.id, 'boundary_changed_after_freeze',
            jsonb_build_object('project_id', v_sys.project_id, 'system_code', v_sys.code, 'op', TG_OP,
                               'entity', v_entity, 'entity_id', v_row ->> 'id',
                               'entity_code', COALESCE(v_row ->> 'tag_number', v_row ->> 'code')));
  END LOOP;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER subsystems_frozen_boundary_log
  AFTER INSERT OR DELETE OR UPDATE OF system_id ON public.subsystems
  FOR EACH ROW EXECUTE FUNCTION public.log_frozen_boundary_change();
CREATE TRIGGER tags_frozen_boundary_log
  AFTER INSERT OR DELETE OR UPDATE OF subsystem_id ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.log_frozen_boundary_change();

REVOKE EXECUTE ON FUNCTION public.guard_system_dependency()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.track_system_boundary()       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_frozen_boundary_change()  FROM PUBLIC, anon;

-- ── 4. Motor de gates: criterio implícito dependencies_ready ─────────────
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
