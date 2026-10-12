-- Fase 1 del plan readiness (docs/ANALISIS-GUIA-COMISIONAMIENTO-2026-10-12.md): motor de gates.
--
-- Un gate (hold point) por sistema se CALCULA con criterios configurables y se APRUEBA
-- formalmente: quién tiene autoridad, con qué condiciones y con qué evidencia (foto congelada).
--   readiness_gates          gates de la org; por defecto uno por fase (MC/RFPC/RFC/RFSU)
--   gate_criteria            catálogo fijo de tipos de criterio (no código libre)
--   system_gate_approvals    aprobación formal por sistema × gate (solo vía RPC)
--   system_gate_attestations declaraciones manuales con adjunto (solo vía RPC)
--   tags.criticality         safety / process / normal ("98 % pero falta la ESD")
-- Estados por gate: approved · approved_with_conditions · regressed (aprobado y hoy en rojo) ·
--                   ready · ready_with_conditions · not_ready
-- Reglas de subsistema × fase = src/lib/certificates/eligibility.ts (vía system_phase_level).

-- ── 1. Criticidad de tags ────────────────────────────────────────────────
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS criticality text NOT NULL DEFAULT 'normal';
ALTER TABLE public.tags
  ADD CONSTRAINT tags_criticality_check CHECK (criticality IN ('safety', 'process', 'normal'));

-- Sugerencia inicial: todo tag con SIL declarado es crítico de seguridad.
UPDATE public.tags
   SET criticality = 'safety'
 WHERE criticality = 'normal'
   AND sil_level IS NOT NULL
   AND lower(btrim(sil_level)) NOT IN ('', 'none', 'n/a', 'na', '-', '0', 'sil 0', 'sil0', 'no');

-- ── 2. Helpers de reglas (comparten lógica con compute_system_readiness) ──
-- Límite de Cat B abiertos por subsistema (mismo criterio que resolveCatBLimit en TS).
CREATE OR REPLACE FUNCTION public.org_cat_b_limit(p_org_id uuid)
RETURNS integer
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN o.settings IS NULL OR NOT (o.settings ? 'max_open_cat_b_per_subsystem') THEN 3
    WHEN jsonb_typeof(o.settings -> 'max_open_cat_b_per_subsystem') = 'number'
      THEN GREATEST(trunc((o.settings ->> 'max_open_cat_b_per_subsystem')::numeric)::int, 0)
    ELSE NULL
  END
  FROM organizations o
  WHERE o.id = p_org_id;
$$;

-- Nivel de un sistema en una fase: peor nivel de sus subsistemas, con detalle de los rojos.
CREATE OR REPLACE FUNCTION public.system_phase_level(p_system_id uuid, p_phase_id uuid, p_limit integer)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH ss AS (
    SELECT s.id, s.code FROM subsystems s WHERE s.system_id = p_system_id
  ),
  pun AS (
    SELECT p.subsystem_id,
           COUNT(*) FILTER (WHERE p.category = 'A') AS a,
           COUNT(*) FILTER (WHERE p.category = 'B') AS b
    FROM punches p
    WHERE p.subsystem_id IN (SELECT id FROM ss)
      AND p.status IN ('open', 'in_progress')
    GROUP BY p.subsystem_id
  ),
  it AS (
    SELECT i.subsystem_id,
           COUNT(*) AS t,
           COUNT(*) FILTER (WHERE i.status = 'approved') AS ap
    FROM itrs i
    WHERE i.subsystem_id IN (SELECT id FROM ss)
      AND i.phase_id = p_phase_id
    GROUP BY i.subsystem_id
  ),
  lvl AS (
    SELECT ss.id, ss.code,
           COALESCE(it.t, 0) AS t, COALESCE(it.ap, 0) AS ap,
           COALESCE(pun.a, 0) AS a, COALESCE(pun.b, 0) AS b,
           CASE
             WHEN COALESCE(pun.a, 0) > 0 THEN 'cat_a'
             WHEN COALESCE(it.t, 0) = 0 THEN 'no_itrs'
             WHEN COALESCE(it.ap, 0) < COALESCE(it.t, 0) THEN 'itrs_pending'
             WHEN p_limit IS NOT NULL AND COALESCE(pun.b, 0) > p_limit THEN 'cat_b_over_limit'
           END AS red_reason,
           CASE
             WHEN COALESCE(pun.a, 0) > 0
               OR COALESCE(it.t, 0) = 0
               OR COALESCE(it.ap, 0) < COALESCE(it.t, 0)
               OR (p_limit IS NOT NULL AND COALESCE(pun.b, 0) > p_limit) THEN 'red'
             WHEN COALESCE(pun.b, 0) > 0 THEN 'yellow'
             ELSE 'green'
           END AS level
    FROM ss
    LEFT JOIN it  ON it.subsystem_id = ss.id
    LEFT JOIN pun ON pun.subsystem_id = ss.id
  )
  SELECT jsonb_build_object(
    'level', CASE WHEN COUNT(*) = 0 OR COUNT(*) FILTER (WHERE level = 'red') > 0 THEN 'red'
                  WHEN COUNT(*) FILTER (WHERE level = 'yellow') > 0 THEN 'yellow'
                  ELSE 'green' END,
    'subsystems_total',  COUNT(*),
    'subsystems_red',    COUNT(*) FILTER (WHERE level = 'red'),
    'subsystems_yellow', COUNT(*) FILTER (WHERE level = 'yellow'),
    'itr_total',         COALESCE(SUM(t), 0),
    'itr_approved',      COALESCE(SUM(ap), 0),
    'open_cat_b',        COALESCE(SUM(b), 0),
    'red_subsystems',    COALESCE(jsonb_agg(jsonb_build_object(
                            'id', id, 'code', code, 'reason', red_reason,
                            'itr_total', t, 'itr_approved', ap, 'open_a', a, 'open_b', b)
                          ORDER BY code) FILTER (WHERE level = 'red'), '[]'::jsonb)
  )
  FROM lvl;
$$;

-- compute_system_readiness (F0) pasa a usar los helpers: misma salida, una sola lógica.
CREATE OR REPLACE FUNCTION public.compute_system_readiness(p_system_id uuid)
RETURNS TABLE(
  system_id uuid,
  itr_total integer,
  itr_approved integer,
  itr_pct numeric,
  open_punches_a integer,
  open_punches_b integer,
  open_punches_c integer,
  cat_b_limit integer,
  gates jsonb,
  blockers jsonb
)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_org          uuid;
  v_limit        integer;
  v_ss_count     integer := 0;
  v_itr_total    integer := 0;
  v_itr_approved integer := 0;
  v_itr_pct      numeric := 0;
  v_a            integer := 0;
  v_b            integer := 0;
  v_c            integer := 0;
  v_b_over       integer := 0;
  v_gates        jsonb   := '[]'::jsonb;
  v_blockers     jsonb   := '[]'::jsonb;
BEGIN
  SELECT p.org_id INTO v_org
  FROM systems s JOIN projects p ON p.id = s.project_id
  WHERE s.id = p_system_id;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  v_limit := public.org_cat_b_limit(v_org);

  SELECT COUNT(*)::int INTO v_ss_count FROM subsystems ss WHERE ss.system_id = p_system_id;

  SELECT COUNT(*)::int, COUNT(*) FILTER (WHERE i.status = 'approved')::int
    INTO v_itr_total, v_itr_approved
  FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id
  WHERE ss.system_id = p_system_id;

  IF v_itr_total > 0 THEN
    v_itr_pct := ROUND((v_itr_approved::numeric / v_itr_total) * 100, 2);
  END IF;

  SELECT COUNT(*) FILTER (WHERE p.category = 'A')::int,
         COUNT(*) FILTER (WHERE p.category = 'B')::int,
         COUNT(*) FILTER (WHERE p.category = 'C')::int
    INTO v_a, v_b, v_c
  FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id
  WHERE ss.system_id = p_system_id
    AND p.status IN ('open', 'in_progress');

  IF v_limit IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_b_over
    FROM (
      SELECT p.subsystem_id
      FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id
      WHERE ss.system_id = p_system_id
        AND p.category = 'B'
        AND p.status IN ('open', 'in_progress')
      GROUP BY p.subsystem_id
      HAVING COUNT(*) > v_limit
    ) over_limit;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'phase_id',          f.id,
           'code',              f.code,
           'name',              f.name,
           'certificate',       COALESCE(f.certificate_name, f.code),
           'order',             f.order_index,
           'itr_total',         (l.v ->> 'itr_total')::int,
           'itr_approved',      (l.v ->> 'itr_approved')::int,
           'subsystems_total',  (l.v ->> 'subsystems_total')::int,
           'subsystems_red',    (l.v ->> 'subsystems_red')::int,
           'subsystems_yellow', (l.v ->> 'subsystems_yellow')::int,
           'level',             l.v ->> 'level',
           'ready',             (l.v ->> 'level') <> 'red'
         ) ORDER BY f.order_index), '[]'::jsonb)
    INTO v_gates
  FROM project_phases f
  CROSS JOIN LATERAL (SELECT public.system_phase_level(p_system_id, f.id, v_limit) AS v) l
  WHERE f.org_id = v_org;

  IF v_ss_count = 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'no_subsystems', 'severity', 'high',
      'message', 'No subsystems defined for this system'));
  END IF;

  IF v_itr_total = 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'no_itrs', 'severity', 'high',
      'message', 'No ITRs defined for this system'));
  ELSIF v_itr_approved < v_itr_total THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'itrs_incomplete', 'severity', 'high',
      'message', format('%s of %s ITRs approved (%s%%)', v_itr_approved, v_itr_total, v_itr_pct),
      'pending', v_itr_total - v_itr_approved));
  END IF;

  IF v_a > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'punches_a_open', 'severity', 'high',
      'message', format('%s Category A punch(es) open — block every gate', v_a),
      'count', v_a));
  END IF;

  IF v_b_over > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'punches_b_over_limit', 'severity', 'high',
      'message', format('%s subsystem(s) exceed the limit of %s open Category B punches', v_b_over, v_limit),
      'count', v_b_over, 'limit', v_limit));
  END IF;

  IF v_b > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'punches_b_open', 'severity', 'medium',
      'message', format('%s Category B punch(es) open — require justification at issuance', v_b),
      'count', v_b));
  END IF;

  RETURN QUERY SELECT p_system_id, v_itr_total, v_itr_approved, v_itr_pct,
                      v_a, v_b, v_c, v_limit, v_gates, v_blockers;
END;
$$;

-- ── 3. Tablas ────────────────────────────────────────────────────────────
CREATE TABLE public.readiness_gates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code              text NOT NULL,
  name              text NOT NULL,
  description       text,
  order_index       integer NOT NULL DEFAULT 0,
  phase_id          uuid REFERENCES public.project_phases(id) ON DELETE SET NULL,
  requires_previous boolean NOT NULL DEFAULT true,
  is_active         boolean NOT NULL DEFAULT true,
  approval_roles    text[] NOT NULL DEFAULT ARRAY['owner', 'admin', 'architect'],
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT readiness_gates_code_unique UNIQUE (org_id, code),
  CONSTRAINT readiness_gates_code_check CHECK (btrim(code) <> ''),
  CONSTRAINT readiness_gates_roles_check CHECK (
    cardinality(approval_roles) > 0
    AND approval_roles <@ ARRAY['owner', 'admin', 'architect', 'leader', 'inspector', 'client'])
);
CREATE INDEX readiness_gates_org_idx ON public.readiness_gates (org_id, order_index);

CREATE TABLE public.gate_criteria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id     uuid NOT NULL REFERENCES public.readiness_gates(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  params      jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_blocking boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gate_criteria_kind_check CHECK (kind IN (
    'itr_phase_approved', 'certificates_issued', 'pssr_approved',
    'critical_tags_ready', 'manual_attestation'))
);
CREATE INDEX gate_criteria_gate_idx ON public.gate_criteria (gate_id, order_index);

CREATE TABLE public.system_gate_approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_id     uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  gate_id       uuid NOT NULL REFERENCES public.readiness_gates(id) ON DELETE RESTRICT,
  status        text NOT NULL,
  conditions    jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes         text,
  approved_by   uuid NOT NULL,
  approved_role text NOT NULL,
  approved_at   timestamptz NOT NULL DEFAULT now(),
  revoked_by    uuid,
  revoked_at    timestamptz,
  revoke_reason text,
  CONSTRAINT system_gate_approvals_status_check CHECK (status IN ('approved', 'approved_with_conditions'))
);
CREATE UNIQUE INDEX system_gate_approvals_active_uq
  ON public.system_gate_approvals (system_id, gate_id) WHERE revoked_at IS NULL;
CREATE INDEX system_gate_approvals_project_idx ON public.system_gate_approvals (project_id);

CREATE TABLE public.system_gate_attestations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_id    uuid NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.gate_criteria(id) ON DELETE CASCADE,
  comment      text NOT NULL,
  file_path    text NOT NULL,
  attested_by  uuid NOT NULL,
  attested_at  timestamptz NOT NULL DEFAULT now(),
  revoked_by   uuid,
  revoked_at   timestamptz
);
CREATE UNIQUE INDEX system_gate_attestations_active_uq
  ON public.system_gate_attestations (system_id, criterion_id) WHERE revoked_at IS NULL;
CREATE INDEX system_gate_attestations_project_idx ON public.system_gate_attestations (project_id);

-- ── 4. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.readiness_gates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_criteria            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_gate_approvals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_gate_attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY readiness_gates_select ON public.readiness_gates FOR SELECT
  USING (org_id IN (SELECT public.get_my_org_ids()));
CREATE POLICY readiness_gates_insert ON public.readiness_gates FOR INSERT
  WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY readiness_gates_update ON public.readiness_gates FOR UPDATE
  USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY readiness_gates_delete ON public.readiness_gates FOR DELETE
  USING (public.is_org_admin(org_id));

CREATE POLICY gate_criteria_select ON public.gate_criteria FOR SELECT
  USING (org_id IN (SELECT public.get_my_org_ids()));
CREATE POLICY gate_criteria_insert ON public.gate_criteria FOR INSERT
  WITH CHECK (public.is_org_admin(org_id)
    AND EXISTS (SELECT 1 FROM public.readiness_gates g WHERE g.id = gate_id AND g.org_id = gate_criteria.org_id));
CREATE POLICY gate_criteria_update ON public.gate_criteria FOR UPDATE
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id)
    AND EXISTS (SELECT 1 FROM public.readiness_gates g WHERE g.id = gate_id AND g.org_id = gate_criteria.org_id));
CREATE POLICY gate_criteria_delete ON public.gate_criteria FOR DELETE
  USING (public.is_org_admin(org_id));

-- Aprobaciones y declaraciones: lectura para miembros del proyecto; escritura solo por RPC.
CREATE POLICY system_gate_approvals_select ON public.system_gate_approvals FOR SELECT
  USING (project_id IN (SELECT public.get_my_project_ids()));
CREATE POLICY system_gate_attestations_select ON public.system_gate_attestations FOR SELECT
  USING (project_id IN (SELECT public.get_my_project_ids()));

-- ── 5. Bucket de evidencias (ruta <org_id>/<system_id>/<archivo>) ───────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('gate-evidence', 'gate-evidence', false, 20971520)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY gate_evidence_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'gate-evidence'
    AND (storage.foldername(name))[1] IN (SELECT public.get_my_org_ids()::text));
CREATE POLICY gate_evidence_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gate-evidence'
    AND (storage.foldername(name))[1] IN (SELECT public.get_my_org_ids()::text));
-- Evidencia inmutable: sin UPDATE ni DELETE para usuarios.
CREATE POLICY gate_evidence_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'gate-evidence') WITH CHECK (bucket_id <> 'gate-evidence');
CREATE POLICY gate_evidence_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'gate-evidence');

-- ── 6. Gate por defecto por cada fase ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_default_gate_for_phase(p_phase_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phase   project_phases%ROWTYPE;
  v_code    text;
  v_gate_id uuid;
  v_first   boolean;
BEGIN
  SELECT * INTO v_phase FROM project_phases WHERE id = p_phase_id;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM readiness_gates WHERE phase_id = p_phase_id) THEN
    RETURN NULL;
  END IF;

  v_code  := upper(btrim(COALESCE(NULLIF(btrim(v_phase.certificate_name), ''), v_phase.code)));
  v_first := NOT EXISTS (SELECT 1 FROM readiness_gates WHERE org_id = v_phase.org_id);

  INSERT INTO readiness_gates (org_id, code, name, order_index, phase_id, requires_previous)
  VALUES (v_phase.org_id, v_code, v_phase.name, v_phase.order_index * 10, v_phase.id, NOT v_first)
  ON CONFLICT (org_id, code) DO NOTHING
  RETURNING id INTO v_gate_id;

  IF v_gate_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO gate_criteria (gate_id, org_id, kind, params, order_index) VALUES
    (v_gate_id, v_phase.org_id, 'itr_phase_approved', '{}'::jsonb, 10),
    (v_gate_id, v_phase.org_id, 'critical_tags_ready', '{"levels":["safety","process"]}'::jsonb, 20);

  IF v_code = 'RFSU' THEN
    INSERT INTO gate_criteria (gate_id, org_id, kind, params, order_index)
    VALUES (v_gate_id, v_phase.org_id, 'pssr_approved', '{}'::jsonb, 30);
  END IF;

  RETURN v_gate_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_default_gate_for_phase(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.seed_default_gate_for_phase(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_seed_gate_for_phase()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.seed_default_gate_for_phase(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_phases_seed_gate
  AFTER INSERT ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_gate_for_phase();

-- Orgs existentes: un gate por fase, en orden.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.project_phases ORDER BY org_id, order_index LOOP
    PERFORM public.seed_default_gate_for_phase(r.id);
  END LOOP;
END;
$$;

-- ── 7. Evaluación de gates por sistema ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_system_gates(p_system_id uuid)
RETURNS TABLE(
  gate_id           uuid,
  gate_code         text,
  gate_name         text,
  gate_order        integer,
  gate_phase_id     uuid,
  requires_previous boolean,
  approval_roles    text[],
  computed_level    text,
  status            text,
  criteria          jsonb,
  approval          jsonb
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

      -- Un criterio no bloqueante que falla solo advierte.
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

    SELECT jsonb_build_object('id', a.id, 'status', a.status, 'conditions', a.conditions, 'notes', a.notes,
                              'approved_by', a.approved_by, 'approved_role', a.approved_role,
                              'approved_at', a.approved_at)
      INTO v_appr
    FROM system_gate_approvals a
    WHERE a.system_id = p_system_id AND a.gate_id = g.id AND a.revoked_at IS NULL;

    gate_id           := g.id;
    gate_code         := g.code;
    gate_name         := g.name;
    gate_order        := g.order_index;
    gate_phase_id     := g.phase_id;
    requires_previous := g.requires_previous;
    approval_roles    := g.approval_roles;
    computed_level    := v_level;
    criteria          := v_crit;
    approval          := v_appr;
    status := CASE
      WHEN v_appr IS NOT NULL AND v_level = 'red' THEN 'regressed'
      WHEN v_appr IS NOT NULL THEN v_appr ->> 'status'
      WHEN v_level = 'green'  THEN 'ready'
      WHEN v_level = 'yellow' THEN 'ready_with_conditions'
      ELSE 'not_ready'
    END;
    RETURN NEXT;

    v_prev_ok := v_appr IS NOT NULL;
    v_first   := false;
  END LOOP;
END;
$$;

-- Matriz de un proyecto: una fila por sistema con sus gates.
CREATE OR REPLACE FUNCTION public.compute_project_gates(p_project_id uuid)
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

-- ── 8. RPCs de escritura (SECURITY DEFINER, validan rol y org) ───────────
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
  v_status     text;
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

  -- Condiciones: lista de textos (máx. 20, 500 caracteres c/u).
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

  v_status := CASE WHEN v_row.computed_level = 'yellow' OR jsonb_array_length(v_conditions) > 0
                   THEN 'approved_with_conditions' ELSE 'approved' END;

  INSERT INTO system_gate_approvals (org_id, project_id, system_id, gate_id, status, conditions,
                                     evidence, notes, approved_by, approved_role)
  VALUES (v_org, v_project, p_system_id, p_gate_id, v_status, v_conditions,
          jsonb_build_object('computed_level', v_row.computed_level, 'criteria', v_row.criteria,
                             'evaluated_at', now()),
          NULLIF(left(btrim(COALESCE(p_notes, '')), 2000), ''), auth.uid(), v_role)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_system_gate_approval(p_approval_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_appr system_gate_approvals%ROWTYPE;
  v_role text;
  v_gate readiness_gates%ROWTYPE;
BEGIN
  SELECT * INTO v_appr FROM system_gate_approvals WHERE id = p_approval_id AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aprobación no encontrada o ya revocada' USING ERRCODE = 'P0002';
  END IF;

  SELECT om.role::text INTO v_role
  FROM org_members om WHERE om.org_id = v_appr.org_id AND om.user_id = auth.uid();
  SELECT * INTO v_gate FROM readiness_gates WHERE id = v_appr.gate_id;
  IF v_role IS NULL OR NOT (v_role IN ('owner', 'admin') OR v_role = ANY (v_gate.approval_roles)) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Indica el motivo de la revocación' USING ERRCODE = '22023';
  END IF;

  UPDATE system_gate_approvals
     SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = left(btrim(p_reason), 2000)
   WHERE id = p_approval_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.attest_gate_criterion(
  p_system_id    uuid,
  p_criterion_id uuid,
  p_comment      text,
  p_file_path    text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org     uuid;
  v_project uuid;
  v_crit    gate_criteria%ROWTYPE;
  v_id      uuid;
BEGIN
  SELECT s.project_id, p.org_id INTO v_project, v_org
  FROM systems s JOIN projects p ON p.id = s.project_id
  WHERE s.id = p_system_id;
  IF v_org IS NULL OR NOT public.is_project_editor(v_project) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_crit FROM gate_criteria WHERE id = p_criterion_id AND org_id = v_org;
  IF NOT FOUND OR v_crit.kind <> 'manual_attestation' THEN
    RAISE EXCEPTION 'Criterio no válido' USING ERRCODE = 'P0002';
  END IF;

  IF btrim(COALESCE(p_comment, '')) = '' THEN
    RAISE EXCEPTION 'El comentario es obligatorio' USING ERRCODE = '22023';
  END IF;

  IF p_file_path IS NULL
     OR p_file_path NOT LIKE v_org::text || '/' || p_system_id::text || '/%'
     OR NOT EXISTS (SELECT 1 FROM storage.objects o
                    WHERE o.bucket_id = 'gate-evidence' AND o.name = p_file_path) THEN
    RAISE EXCEPTION 'Adjunto de evidencia no válido' USING ERRCODE = '22023';
  END IF;

  UPDATE system_gate_attestations
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE system_id = p_system_id AND criterion_id = p_criterion_id AND revoked_at IS NULL;

  INSERT INTO system_gate_attestations (org_id, project_id, system_id, criterion_id, comment, file_path, attested_by)
  VALUES (v_org, v_project, p_system_id, p_criterion_id, left(btrim(p_comment), 2000), p_file_path, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_gate_attestation(p_attestation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_att system_gate_attestations%ROWTYPE;
BEGIN
  SELECT * INTO v_att FROM system_gate_attestations WHERE id = p_attestation_id AND revoked_at IS NULL;
  IF NOT FOUND OR NOT public.is_project_editor(v_att.project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  UPDATE system_gate_attestations
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE id = p_attestation_id;
END;
$$;

-- ── 9. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.org_cat_b_limit(uuid)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.system_phase_level(uuid, uuid, integer)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_system_gates(uuid)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_project_gates(uuid)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_system_gate(uuid, uuid, jsonb, text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_system_gate_approval(uuid, text)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.attest_gate_criterion(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_gate_attestation(uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_seed_gate_for_phase()                     FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.org_cat_b_limit(uuid)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.system_phase_level(uuid, uuid, integer)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_system_gates(uuid)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_project_gates(uuid)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_system_gate(uuid, uuid, jsonb, text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_system_gate_approval(uuid, text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attest_gate_criterion(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_gate_attestation(uuid)                 TO authenticated, service_role;
