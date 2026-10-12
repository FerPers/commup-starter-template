-- Multifirma de gates (2026-10-12, decisión de Luis): además de quien aprueba (Comisionamiento),
-- el gate exige las firmas de Operaciones y HSE, cada una de una persona distinta (independencia
-- de la revisión, guía 16.9). Configurable por gate.
--   readiness_gates.required_signatures  firmas adicionales ('operations', 'hse'); vacío = sin co-firmas
--   readiness_gates.cosign_roles         roles de la org que pueden co-firmar
--   system_gate_approvals.status         + 'pending_signatures'; target_status = estado final
--   system_gate_signatures               una fila por firma (commissioning / operations / hse)
-- Estados del gate: + 'pending_signatures' (aprobado por Comisionamiento, faltan co-firmas).
-- Un gate pendiente de firmas NO habilita al siguiente (requires_previous).

-- ── 1. Configuración por gate ────────────────────────────────────────────
ALTER TABLE public.readiness_gates
  ADD COLUMN required_signatures text[] NOT NULL DEFAULT ARRAY['operations', 'hse'],
  ADD COLUMN cosign_roles text[] NOT NULL DEFAULT ARRAY['owner', 'admin', 'architect', 'leader', 'client'];

ALTER TABLE public.readiness_gates
  ADD CONSTRAINT readiness_gates_required_signatures_check
    CHECK (required_signatures <@ ARRAY['operations', 'hse']),
  ADD CONSTRAINT readiness_gates_cosign_roles_check
    CHECK (cardinality(cosign_roles) > 0
       AND cosign_roles <@ ARRAY['owner', 'admin', 'architect', 'leader', 'inspector', 'client']);

-- ── 2. Aprobaciones pendientes de firmas ─────────────────────────────────
ALTER TABLE public.system_gate_approvals DROP CONSTRAINT system_gate_approvals_status_check;
ALTER TABLE public.system_gate_approvals
  ADD COLUMN target_status text,
  ADD CONSTRAINT system_gate_approvals_status_check
    CHECK (status IN ('approved', 'approved_with_conditions', 'pending_signatures')),
  ADD CONSTRAINT system_gate_approvals_target_status_check
    CHECK (target_status IS NULL OR target_status IN ('approved', 'approved_with_conditions'));

CREATE TABLE public.system_gate_signatures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES public.system_gate_approvals(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  capacity    text NOT NULL,
  user_id     uuid NOT NULL,
  user_role   text NOT NULL,
  comments    text,
  signed_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_gate_signatures_capacity_check CHECK (capacity IN ('commissioning', 'operations', 'hse')),
  CONSTRAINT system_gate_signatures_capacity_uq UNIQUE (approval_id, capacity),
  CONSTRAINT system_gate_signatures_user_uq UNIQUE (approval_id, user_id)
);
CREATE INDEX system_gate_signatures_project_idx ON public.system_gate_signatures (project_id);

ALTER TABLE public.system_gate_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_gate_signatures_select ON public.system_gate_signatures FOR SELECT
  USING (project_id IN (SELECT public.get_my_project_ids()));

-- ── 3. Evaluación: nuevo estado y firmas en la salida ────────────────────
DROP FUNCTION IF EXISTS public.compute_project_gates(uuid);
DROP FUNCTION IF EXISTS public.compute_system_gates(uuid);

CREATE FUNCTION public.compute_system_gates(p_system_id uuid)
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

CREATE FUNCTION public.compute_project_gates(p_project_id uuid)
RETURNS TABLE(
  system_id   uuid,
  system_code text,
  system_name text,
  area_code   text,
  area_name   text,
  gates       jsonb
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT s.id, s.code, s.name, a.code, a.name,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'gate_id', g.gate_id, 'code', g.gate_code, 'name', g.gate_name,
                    'order', g.gate_order, 'computed_level', g.computed_level, 'status', g.status,
                    'failing', (SELECT COUNT(*) FROM jsonb_array_elements(g.criteria) cr
                                WHERE cr ->> 'result' = 'fail'),
                    'approval', g.approval
                  ) ORDER BY g.gate_order, g.gate_code)
           FROM public.compute_system_gates(s.id) g
         ), '[]'::jsonb)
  FROM systems s
  JOIN areas a ON a.id = s.area_id
  WHERE s.project_id = p_project_id
  ORDER BY a.code, s.code;
$$;

-- ── 4. Aprobar = firma de Comisionamiento; queda pendiente si faltan co-firmas ──
CREATE OR REPLACE FUNCTION public.approve_system_gate(
  p_system_id  uuid,
  p_gate_id    uuid,
  p_conditions jsonb DEFAULT '[]'::jsonb,
  p_notes      text  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org        uuid;
  v_project    uuid;
  v_role       text;
  v_gate       readiness_gates%ROWTYPE;
  v_row        record;
  v_conditions jsonb := '[]'::jsonb;
  v_item       jsonb;
  v_text       text;
  v_target     text;
  v_notes      text;
  v_id         uuid;
BEGIN
  SELECT s.project_id, p.org_id INTO v_project, v_org
  FROM systems s JOIN projects p ON p.id = s.project_id
  WHERE s.id = p_system_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT om.role::text INTO v_role
  FROM org_members om WHERE om.org_id = v_org AND om.user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_gate FROM readiness_gates
  WHERE id = p_gate_id AND org_id = v_org AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gate no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_role = ANY (v_gate.approval_roles)) THEN
    RAISE EXCEPTION 'Tu rol (%) no puede aprobar el gate %', v_role, v_gate.code USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM system_gate_approvals
             WHERE system_id = p_system_id AND gate_id = p_gate_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'El gate % ya está aprobado para este sistema', v_gate.code USING ERRCODE = '23505';
  END IF;

  IF p_conditions IS NOT NULL AND jsonb_typeof(p_conditions) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP
      IF jsonb_typeof(v_item) = 'string' THEN
        v_text := left(btrim(v_item #>> '{}'), 500);
        IF v_text <> '' THEN
          v_conditions := v_conditions || to_jsonb(v_text);
        END IF;
      END IF;
    END LOOP;
  END IF;
  IF jsonb_array_length(v_conditions) > 20 THEN
    RAISE EXCEPTION 'Máximo 20 condiciones' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.compute_system_gates(p_system_id) r WHERE r.gate_id = p_gate_id;
  IF NOT FOUND OR v_row.computed_level = 'red' THEN
    RAISE EXCEPTION 'El gate % no cumple sus criterios: no se puede aprobar', v_gate.code USING ERRCODE = 'P0001';
  END IF;
  IF v_row.computed_level = 'yellow' AND jsonb_array_length(v_conditions) = 0 THEN
    RAISE EXCEPTION 'El gate está listo con condiciones: describe al menos una condición' USING ERRCODE = '22023';
  END IF;

  v_target := CASE WHEN v_row.computed_level = 'yellow' OR jsonb_array_length(v_conditions) > 0
                   THEN 'approved_with_conditions' ELSE 'approved' END;
  v_notes  := NULLIF(left(btrim(COALESCE(p_notes, '')), 2000), '');

  INSERT INTO system_gate_approvals (org_id, project_id, system_id, gate_id, status, target_status,
                                     conditions, evidence, notes, approved_by, approved_role)
  VALUES (v_org, v_project, p_system_id, p_gate_id,
          CASE WHEN cardinality(v_gate.required_signatures) > 0 THEN 'pending_signatures' ELSE v_target END,
          v_target, v_conditions,
          jsonb_build_object('computed_level', v_row.computed_level, 'criteria', v_row.criteria,
                             'evaluated_at', now()),
          v_notes, auth.uid(), v_role)
  RETURNING id INTO v_id;

  INSERT INTO system_gate_signatures (approval_id, org_id, project_id, capacity, user_id, user_role, comments)
  VALUES (v_id, v_org, v_project, 'commissioning', auth.uid(), v_role, v_notes);

  RETURN v_id;
END;
$$;

-- ── 5. Co-firma de Operaciones / HSE ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sign_system_gate(
  p_approval_id uuid,
  p_capacity    text,
  p_comments    text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_appr   system_gate_approvals%ROWTYPE;
  v_gate   readiness_gates%ROWTYPE;
  v_role   text;
  v_level  text;
  v_signed integer;
BEGIN
  SELECT * INTO v_appr FROM system_gate_approvals
  WHERE id = p_approval_id AND revoked_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aprobación no encontrada o revocada' USING ERRCODE = 'P0002';
  END IF;

  SELECT om.role::text INTO v_role
  FROM org_members om WHERE om.org_id = v_appr.org_id AND om.user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_gate FROM readiness_gates WHERE id = v_appr.gate_id;

  IF v_appr.status <> 'pending_signatures' THEN
    RAISE EXCEPTION 'La aprobación del gate % ya tiene todas sus firmas', v_gate.code USING ERRCODE = 'P0001';
  END IF;
  IF NOT (p_capacity = ANY (v_gate.required_signatures)) THEN
    RAISE EXCEPTION 'El gate % no requiere la firma %', v_gate.code, p_capacity USING ERRCODE = '22023';
  END IF;
  IF NOT (v_role = ANY (v_gate.cosign_roles)) THEN
    RAISE EXCEPTION 'Tu rol (%) no puede co-firmar el gate %', v_role, v_gate.code USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM system_gate_signatures WHERE approval_id = p_approval_id AND capacity = p_capacity) THEN
    RAISE EXCEPTION 'La firma % ya fue registrada', p_capacity USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM system_gate_signatures WHERE approval_id = p_approval_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ya firmaste este gate: cada firma debe ser de una persona distinta' USING ERRCODE = '23505';
  END IF;

  SELECT r.computed_level INTO v_level
  FROM public.compute_system_gates(v_appr.system_id) r WHERE r.gate_id = v_appr.gate_id;
  IF v_level IS NULL OR v_level = 'red' THEN
    RAISE EXCEPTION 'El gate % ya no cumple sus criterios: revisa los bloqueos antes de firmar', v_gate.code USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO system_gate_signatures (approval_id, org_id, project_id, capacity, user_id, user_role, comments)
  VALUES (p_approval_id, v_appr.org_id, v_appr.project_id, p_capacity, auth.uid(), v_role,
          NULLIF(left(btrim(COALESCE(p_comments, '')), 2000), ''));

  SELECT COUNT(DISTINCT s.capacity)::int INTO v_signed
  FROM system_gate_signatures s
  WHERE s.approval_id = p_approval_id AND s.capacity = ANY (v_gate.required_signatures);

  IF v_signed >= cardinality(v_gate.required_signatures) THEN
    UPDATE system_gate_approvals
       SET status = COALESCE(target_status, 'approved')
     WHERE id = p_approval_id;
    RETURN COALESCE(v_appr.target_status, 'approved');
  END IF;

  RETURN 'pending_signatures';
END;
$$;

-- ── 6. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.compute_system_gates(uuid)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_project_gates(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sign_system_gate(uuid, text, text)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.compute_system_gates(uuid)           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.compute_project_gates(uuid)          TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.sign_system_gate(uuid, text, text)   TO authenticated, service_role;
