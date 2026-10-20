-- S11 — Lógica de gates (revisión integral 2026-10-19, decisión D13 aprobada 2026-10-20)
--
--   D-02 / D13  La regresión se propaga: el gate anterior en regresión BLOQUEA el siguiente; un proveedor en
--               regresión deja CONDICIÓN en sus dependientes. Configurable por org en
--               organizations.settings.gate_policy (org_gate_policy()).
--   D-13        Un punch nuevo no regresa los gates ya aprobados (solo cuentan los anteriores a la aprobación):
--               frena el siguiente gate. Configurable (cat_a_regresses_approved).
--   D-11        Una sola regla PSSR (el más reciente) para el gate y los prerrequisitos de arranque.
--   E-07        readiness_gates.is_startup_gate explícito (único por org); sin marca nunca se infiere un gate
--               que exija prueba de desempeño.
--   E-08        El line-up que cuenta es el de propósito «startup».
--   E-14        performance_tests.status (active/withdrawn) + withdraw_performance_test; solo cuentan las
--               vigentes con una revisión aprobada.
--   D-10/F-28   documents_current por la fase del gate y por subsistema; procedimientos solo en el gate de
--               arranque; un gate aprobado con condición nueva pasa a «approved_needs_review».
--   D-14        Bajar N≥3, mover de gate/sistema una restricción abierta: líder+ con motivo; cerrar otra persona.
--   D-15        actions.original_due_date; replanificar con motivo; método fijo una vez empezada (salvo líder+).
--   D-17        KPI de compromisos sobre los que vencían en la ventana y con completed_at (todas las firmas).
--   D-20        Configuración de gates auditada (activity_log), criterios con declaraciones se borran lógico,
--               quitar una firma requerida completa las aprobaciones pendientes que ya la cumplen.
--   D-21        Retirar una declaración exige motivo, queda auditado y no se puede con el gate aprobado.
--   D-35        Ciclos de dependencias por gate y no por sistema.
--
-- Las funciones de abajo del separador se emiten desde supabase/functions-sql/ (canónicas).

-- ── 1. Columnas ──────────────────────────────────────────────────────────
ALTER TABLE public.readiness_gates ADD COLUMN IF NOT EXISTS is_startup_gate boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS readiness_gates_one_startup_uq ON public.readiness_gates (org_id) WHERE is_startup_gate;
COMMENT ON COLUMN public.readiness_gates.is_startup_gate IS
  'S11 (E-07): gate cuyo cumplimiento habilita primer arranque / primer HC. Uno por org.';

-- Respaldo: la regla que se infería, sin gates que exijan prueba de desempeño.
UPDATE public.readiness_gates g SET is_startup_gate = true
WHERE g.id IN (
  SELECT DISTINCT ON (org_id) id FROM public.readiness_gates
  WHERE is_active AND NOT requires_performance
  ORDER BY org_id, requires_lineup DESC, order_index DESC, code DESC)
  AND NOT EXISTS (SELECT 1 FROM public.readiness_gates x WHERE x.org_id = g.org_id AND x.is_startup_gate);

ALTER TABLE public.gate_criteria ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.system_gate_attestations ADD COLUMN IF NOT EXISTS revoke_reason text;

ALTER TABLE public.system_gate_approvals ADD COLUMN IF NOT EXISTS completed_at timestamptz;
COMMENT ON COLUMN public.system_gate_approvals.completed_at IS 'S11 (D-17): cuando la aprobación quedó con todas las firmas requeridas.';
UPDATE public.system_gate_approvals a
   SET completed_at = COALESCE((SELECT max(s.signed_at) FROM public.system_gate_signatures s WHERE s.approval_id = a.id), a.approved_at)
 WHERE a.status <> 'pending_signatures' AND a.completed_at IS NULL;

ALTER TABLE public.performance_tests
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdraw_reason text;
DO $$ BEGIN
  ALTER TABLE public.performance_tests ADD CONSTRAINT performance_tests_status_check CHECK (status IN ('active', 'withdrawn'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS original_due_date date;
COMMENT ON COLUMN public.actions.original_due_date IS 'S11 (D-15): primera fecha comprometida; el KPI «a tiempo» mide contra ella.';
UPDATE public.actions SET original_due_date = due_date WHERE original_due_date IS NULL AND due_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.actions_original_due()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $fn$
BEGIN
  IF NEW.original_due_date IS NULL THEN NEW.original_due_date := NEW.due_date; END IF;
  IF TG_OP = 'UPDATE' AND OLD.original_due_date IS NOT NULL THEN NEW.original_due_date := OLD.original_due_date; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.actions_original_due() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS actions_original_due ON public.actions;
CREATE TRIGGER actions_original_due BEFORE INSERT OR UPDATE ON public.actions FOR EACH ROW EXECUTE FUNCTION public.actions_original_due();

-- ── 2. Política de gates por org y PSSR único ────────────────────────────
CREATE OR REPLACE FUNCTION public.org_gate_policy(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $fn$
  SELECT jsonb_build_object(
    'regressed_previous', CASE WHEN p.v ->> 'regressed_previous' = 'condition' THEN 'condition' ELSE 'block' END,
    'regressed_dependency', CASE WHEN p.v ->> 'regressed_dependency' = 'block' THEN 'block' ELSE 'condition' END,
    'cat_a_regresses_approved', COALESCE((p.v ->> 'cat_a_regresses_approved')::boolean, false))
  FROM (SELECT COALESCE((SELECT settings -> 'gate_policy' FROM organizations WHERE id = p_org_id), '{}'::jsonb) AS v) p
$fn$;
COMMENT ON FUNCTION public.org_gate_policy(uuid) IS
  'S11 (D13): organizations.settings.gate_policy con valores por defecto: regressed_previous=block, regressed_dependency=condition, cat_a_regresses_approved=false.';

CREATE OR REPLACE FUNCTION public.system_pssr_status(p_system_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $fn$
  -- S11 (D-11): el PSSR que cuenta es el más reciente del sistema (uno rechazado o en curso no queda tapado por uno viejo aprobado).
  SELECT COALESCE((
    SELECT jsonb_build_object('review_id', pr.id, 'review_number', pr.review_number, 'review_status', pr.status)
    FROM pssr_reviews pr WHERE pr.system_id = p_system_id ORDER BY pr.created_at DESC LIMIT 1), '{}'::jsonb)
$fn$;

REVOKE ALL ON FUNCTION public.org_gate_policy(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.system_pssr_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_gate_policy(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.system_pssr_status(uuid) TO authenticated, service_role;

-- ── 3. Configuración auditada y sin borrar el pasado (D-20) ───────────────
CREATE OR REPLACE FUNCTION public.gate_config_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE v_row jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END); v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
    VALUES ((v_row ->> 'org_id')::uuid, auth.uid(), TG_TABLE_NAME, (v_row ->> 'id')::uuid, lower(TG_OP),
            jsonb_build_object('new', CASE WHEN TG_OP <> 'DELETE' THEN v_row END, 'old', v_old));
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.gate_config_audit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS gate_config_audit ON public.readiness_gates;
CREATE TRIGGER gate_config_audit AFTER INSERT OR UPDATE OR DELETE ON public.readiness_gates FOR EACH ROW EXECUTE FUNCTION public.gate_config_audit();
DROP TRIGGER IF EXISTS gate_config_audit ON public.gate_criteria;
CREATE TRIGGER gate_config_audit AFTER INSERT OR UPDATE OR DELETE ON public.gate_criteria FOR EACH ROW EXECUTE FUNCTION public.gate_config_audit();

-- Un criterio con declaraciones (vigentes o retiradas) no se borra: se marca deleted_at y deja de evaluarse.
CREATE OR REPLACE FUNCTION public.gate_criteria_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM system_gate_attestations WHERE criterion_id = OLD.id) THEN
    IF pg_trigger_depth() > 1 THEN
      RAISE EXCEPTION 'El gate tiene declaraciones registradas: desactívalo en lugar de borrarlo' USING ERRCODE = 'P0001';
    END IF;
    UPDATE gate_criteria SET deleted_at = now() WHERE id = OLD.id AND deleted_at IS NULL;
    RETURN NULL;
  END IF;
  RETURN OLD;
END;
$fn$;
REVOKE ALL ON FUNCTION public.gate_criteria_soft_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS gate_criteria_soft_delete ON public.gate_criteria;
CREATE TRIGGER gate_criteria_soft_delete BEFORE DELETE ON public.gate_criteria FOR EACH ROW EXECUTE FUNCTION public.gate_criteria_soft_delete();

-- Quitar una firma requerida no deja aprobaciones pendientes para siempre: se completan las que ya tienen
-- todas las firmas que quedan.
CREATE OR REPLACE FUNCTION public.gate_signatures_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
BEGIN
  UPDATE system_gate_approvals a SET status = COALESCE(a.target_status, 'approved'), completed_at = now()
   WHERE a.gate_id = NEW.id AND a.status = 'pending_signatures' AND a.revoked_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM unnest(NEW.required_signatures) cap
                     WHERE NOT EXISTS (SELECT 1 FROM system_gate_signatures s WHERE s.approval_id = a.id AND s.capacity = cap));
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.gate_signatures_changed() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS gate_signatures_changed ON public.readiness_gates;
CREATE TRIGGER gate_signatures_changed AFTER UPDATE OF required_signatures ON public.readiness_gates
  FOR EACH ROW WHEN (OLD.required_signatures IS DISTINCT FROM NEW.required_signatures)
  EXECUTE FUNCTION public.gate_signatures_changed();

-- ── 4. Retirar una prueba de desempeño (E-14) ────────────────────────────
CREATE OR REPLACE FUNCTION public.withdraw_performance_test(p_test_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE t performance_tests%ROWTYPE; v_role text; v_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 2000), '');
BEGIN
  SELECT * INTO t FROM performance_tests WHERE id = p_test_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prueba no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(t.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo un líder o superior retira una prueba de desempeño' USING ERRCODE = '42501';
  END IF;
  IF t.status = 'withdrawn' THEN RAISE EXCEPTION 'La prueba % ya está retirada', t.number USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Explica por qué se retira (mínimo 10 caracteres)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM performance_runs WHERE test_id = t.id AND status IN ('planned', 'stabilizing', 'formal')) THEN
    RAISE EXCEPTION 'La prueba tiene un intento en curso: ciérralo o abórtalo primero' USING ERRCODE = 'P0001';
  END IF;
  UPDATE performance_tests SET status = 'withdrawn', withdrawn_by = auth.uid(), withdrawn_at = now(), withdraw_reason = v_reason, updated_at = now()
   WHERE id = t.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (t.org_id, auth.uid(), 'performance_test', t.id, 'withdrawn', jsonb_build_object('number', t.number, 'reason', v_reason));
END;
$fn$;
REVOKE ALL ON FUNCTION public.withdraw_performance_test(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_performance_test(uuid, text) TO authenticated, service_role;

-- ── 5. Firmas que cambian (se recrean abajo con un parámetro más) ─────────
DROP FUNCTION IF EXISTS public.system_phase_level(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.update_constraint(uuid, text, text, uuid, uuid, uuid, date, text, text, text);
DROP FUNCTION IF EXISTS public.update_action(uuid, text, text, uuid, uuid, date, text, text, text);
DROP FUNCTION IF EXISTS public.revoke_gate_attestation(uuid);

-- ── 6. Funciones canónicas ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.system_phase_level(p_system_id uuid, p_phase_id uuid, p_limit integer, p_punches_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      -- S11 (D-13): para un gate ya aprobado solo cuentan los punch anteriores a su aprobación
      AND (p_punches_before IS NULL OR p.created_at < p_punches_before)
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
$function$;

CREATE OR REPLACE FUNCTION public.compute_system_gates_upto(p_system_id uuid, p_max_order integer)
 RETURNS TABLE(gate_id uuid, gate_code text, gate_name text, gate_order integer, gate_phase_id uuid, requires_previous boolean, approval_roles text[], required_signatures text[], cosign_roles text[], computed_level text, status text, criteria jsonb, approval jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org     uuid;
  v_limit   integer;
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
  -- S11 (D-02/D13): política de regresión de la org y estado del gate anterior.
  v_pol        jsonb;
  v_prev_state text := 'ok';
  v_cutoff     timestamptz;
  v_warnn      integer;
BEGIN
  SELECT p.org_id INTO v_org
  FROM systems s JOIN projects p ON p.id = s.project_id
  WHERE s.id = p_system_id;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  v_limit := public.org_cat_b_limit(v_org);
  v_pol   := public.org_gate_policy(v_org);

  FOR g IN
    SELECT rg.* FROM readiness_gates rg
    WHERE rg.org_id = v_org AND rg.is_active
      AND (p_max_order IS NULL OR rg.order_index <= p_max_order)
    ORDER BY rg.order_index, rg.code
  LOOP
    v_crit  := '[]'::jsonb;
    v_level := 'green';

    SELECT jsonb_build_object(
             'id', a.id, 'status', a.status, 'target_status', a.target_status,
             'conditions', a.conditions, 'notes', a.notes,
             'approved_by', a.approved_by, 'approved_role', a.approved_role, 'approved_company', a.approved_company, 'approved_at', a.approved_at,
             'completed_at', a.completed_at,
             'signatures', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'capacity', s.capacity, 'user_id', s.user_id, 'user_role', s.user_role, 'signer_company', s.signer_company,
                        'comments', s.comments, 'signed_at', s.signed_at) ORDER BY s.signed_at)
               FROM system_gate_signatures s WHERE s.approval_id = a.id), '[]'::jsonb))
      INTO v_appr
    FROM system_gate_approvals a
    WHERE a.system_id = p_system_id AND a.gate_id = g.id AND a.revoked_at IS NULL;

    -- S11 (D-13): un punch nuevo no regresa un gate ya aprobado (salvo que la org lo pida): para un gate
    -- aprobado solo cuentan los punch levantados antes de la aprobación; los nuevos frenan el siguiente.
    v_cutoff := CASE WHEN v_appr IS NOT NULL AND NOT (v_pol ->> 'cat_a_regresses_approved')::boolean
                     THEN (v_appr ->> 'approved_at')::timestamptz END;

    IF g.requires_previous AND NOT v_first THEN
      -- S11 (D-02, D13): el anterior en regresión bloquea (o deja condición, según la org).
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'previous_gate', 'label', NULL,
        'blocking', v_prev_state = 'missing' OR (v_prev_state = 'regressed' AND v_pol ->> 'regressed_previous' = 'block'),
        'result', CASE WHEN v_prev_state = 'ok' THEN 'pass'
                       WHEN v_prev_state = 'regressed' AND v_pol ->> 'regressed_previous' = 'condition' THEN 'warn'
                       ELSE 'fail' END,
        'detail', jsonb_build_object('regressed', v_prev_state = 'regressed')));
      IF v_prev_state = 'missing' OR (v_prev_state = 'regressed' AND v_pol ->> 'regressed_previous' = 'block') THEN
        v_level := 'red';
      ELSIF v_prev_state = 'regressed' AND v_level = 'green' THEN
        v_level := 'yellow';
      END IF;
    END IF;

    -- Dependencias entre sistemas (F2): criterio implícito y siempre bloqueante. El proveedor
    -- cumple si su gate requerido tiene una aprobación vigente con todas las firmas.
    -- S11 (D-02, D13): un proveedor aprobado pero en regresión deja condición (o bloquea, según la org). Se
    -- evalúa solo hasta su gate requerido: el guard de dependencias impide ciclos entre gates.
    SELECT COUNT(*)::int,
           COUNT(*) FILTER (WHERE NOT x.ok OR (x.regressed AND v_pol ->> 'regressed_dependency' = 'block'))::int,
           COUNT(*) FILTER (WHERE x.ok AND x.regressed AND v_pol ->> 'regressed_dependency' = 'condition')::int,
           COALESCE(jsonb_agg(jsonb_build_object(
             'dependency_id', x.dep_id, 'kind', x.kind,
             'system_id', x.sys_id, 'system_code', x.sys_code, 'system_name', x.sys_name,
             'gate_id', x.gate_id, 'gate_code', x.gate_code,
             'provider_status', CASE WHEN x.regressed THEN 'regressed' ELSE x.appr_status END,
             'ok', x.ok AND NOT x.regressed) ORDER BY x.ok AND NOT x.regressed, x.sys_code), '[]'::jsonb)
      INTO v_total, v_failn, v_warnn, v_fail
    FROM (
      SELECT y.*, CASE WHEN y.ok THEN EXISTS (
               SELECT 1 FROM public.compute_system_gates_upto(y.sys_id, y.gate_order) cg
               WHERE cg.gate_id = y.gate_id AND cg.status = 'regressed') ELSE false END AS regressed
      FROM (
        SELECT d.id AS dep_id, d.kind, ps.id AS sys_id, ps.code AS sys_code, ps.name AS sys_name,
               rg.id AS gate_id, rg.code AS gate_code, rg.order_index AS gate_order, sa.status AS appr_status,
               COALESCE(sa.status IN ('approved', 'approved_with_conditions'), false) AS ok
        FROM system_dependencies d
        JOIN systems ps         ON ps.id = d.depends_on_system_id
        JOIN readiness_gates rg ON rg.id = d.required_gate_id AND rg.is_active
        LEFT JOIN system_gate_approvals sa
               ON sa.system_id = ps.id AND sa.gate_id = rg.id AND sa.revoked_at IS NULL
        WHERE d.system_id = p_system_id AND d.blocked_gate_id = g.id
      ) y
      OFFSET 0  -- sin esto Postgres repite la evaluación del proveedor en cada agregado de abajo
    ) x;
    IF v_total > 0 THEN
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'dependencies_ready', 'label', NULL, 'blocking', v_failn > 0,
        'result', CASE WHEN v_failn > 0 THEN 'fail' WHEN v_warnn > 0 THEN 'warn' ELSE 'pass' END,
        'detail', jsonb_build_object('total', v_total, 'missing_count', v_failn, 'regressed_count', v_warnn, 'dependencies', v_fail)));
      IF v_failn > 0 THEN
        v_level := 'red';
      ELSIF v_warnn > 0 AND v_level = 'green' THEN
        v_level := 'yellow';
      END IF;
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
      WHERE ls.system_id = p_system_id AND ls.status = 'verified' AND ls.purpose = 'startup'  -- S11 (E-08)
      ORDER BY public.lineup_is_stale(ls.id), ls.verified_at DESC
      LIMIT 1;
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'lineup_verified', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_res IS NOT NULL AND NOT (v_res ->> 'stale')::boolean THEN 'pass' ELSE 'fail' END,
        'detail', COALESCE(v_res, jsonb_build_object('missing', true))));
      IF v_res IS NULL OR (v_res ->> 'stale')::boolean THEN v_level := 'red'; END IF;
    END IF;

    -- Documentos vigentes (F8): referencias superadas en registros ya firmados/aprobados del sistema → condición.
    SELECT COUNT(*)::int,
           COALESCE(jsonb_agg(jsonb_build_object('reference_id', x.ref_id, 'document', x.doc_number, 'used', x.used_rev,
             'current', x.cur_rev, 'kind', x.kind, 'target', x.target, 'target_id', x.target_id) ORDER BY x.doc_number, x.target), '[]'::jsonb)
      INTO v_failn, v_fail
    FROM (
      SELECT dr.id AS ref_id, d.number AS doc_number, rv.rev AS used_rev, cur.rev AS cur_rev, 'itr' AS kind,
             i.itr_number AS target, i.id AS target_id
      FROM document_references dr
      JOIN documents d ON d.id = dr.document_id
      JOIN document_revisions rv ON rv.id = dr.revision_id
      JOIN document_revisions cur ON cur.id = d.current_revision_id
      JOIN itrs i ON i.id = dr.itr_id
      JOIN subsystems ss ON ss.id = i.subsystem_id  -- S11 (D-10): por subsistema (ITR de lazo/C&E sin tag también)
      WHERE ss.system_id = p_system_id AND dr.revision_id <> d.current_revision_id
        AND (g.phase_id IS NULL OR i.phase_id = g.phase_id)  -- S11 (D-10/F-28): solo el gate de la fase del ITR
        AND EXISTS (SELECT 1 FROM itr_signatures s WHERE s.itr_id = i.id)
      UNION ALL
      SELECT dr.id, d.number, rv.rev, cur.rev, 'procedure', pr.number || ' R' || prv.rev, pr.id
      FROM document_references dr
      JOIN documents d ON d.id = dr.document_id
      JOIN document_revisions rv ON rv.id = dr.revision_id
      JOIN document_revisions cur ON cur.id = d.current_revision_id
      JOIN procedure_revisions prv ON prv.id = dr.procedure_revision_id
      JOIN procedures pr ON pr.id = prv.procedure_id AND pr.current_revision_id = prv.id
      WHERE pr.system_id = p_system_id AND dr.revision_id <> d.current_revision_id
        AND g.is_startup_gate  -- S11 (D-10): los procedimientos de arranque solo afectan al gate de arranque
    ) x;
    IF v_failn > 0 THEN
    v_crit := v_crit || jsonb_build_array(jsonb_build_object(
      'criterion_id', NULL, 'kind', 'documents_current', 'label', NULL, 'blocking', false,
      'result', CASE WHEN v_failn = 0 THEN 'pass' ELSE 'warn' END,
      'detail', jsonb_build_object('outdated', v_fail, 'outdated_count', v_failn)));
    END IF;
    IF v_failn > 0 AND v_level = 'green' THEN v_level := 'yellow'; END IF;

    -- Prueba de desempeño (F7): criterio implícito y bloqueante si el gate lo exige. Aplica solo a sistemas que son
    -- principales de alguna prueba; cumple cuando cada una tiene un certificado PTC aceptado (tres firmas).
    IF g.requires_performance THEN
      SELECT COUNT(*)::int,
             COUNT(*) FILTER (WHERE pc.id IS NULL)::int,
             COALESCE(jsonb_agg(jsonb_build_object('test_id', pt.id, 'test', pt.number, 'title', pt.title,
               'certificate', pc.number, 'certificate_id', pc.id, 'ok', pc.id IS NOT NULL) ORDER BY pt.number), '[]'::jsonb)
        INTO v_total, v_failn, v_fail
      FROM performance_tests pt
      LEFT JOIN performance_certificates pc ON pc.test_id = pt.id AND pc.status = 'accepted'
      -- S11 (E-14): solo pruebas vigentes y con alguna revisión aprobada (un borrador abandonado no bloquea).
      WHERE pt.primary_system_id = p_system_id AND pt.status = 'active'
        AND EXISTS (SELECT 1 FROM performance_test_revisions r WHERE r.test_id = pt.id AND r.status IN ('approved', 'superseded'));
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'performance_accepted', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_failn = 0 THEN 'pass' ELSE 'fail' END,
        'detail', jsonb_build_object('not_applicable', v_total = 0, 'tests', v_fail, 'missing_count', v_failn)));
      IF v_failn > 0 THEN v_level := 'red'; END IF;
    END IF;

    FOR c IN
      SELECT gc.* FROM gate_criteria gc WHERE gc.gate_id = g.id AND gc.deleted_at IS NULL ORDER BY gc.order_index, gc.created_at
    LOOP
      v_phase := COALESCE(NULLIF(c.params ->> 'phase_id', '')::uuid, g.phase_id);
      v_res   := '{}'::jsonb;
      v_result := 'fail';

      IF c.kind = 'itr_phase_approved' THEN
        IF v_phase IS NULL THEN
          v_res := jsonb_build_object('error', 'no_phase');
        ELSE
          v_res := public.system_phase_level(p_system_id, v_phase, v_limit, v_cutoff);
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
        -- S11 (D-11): misma regla que los prerrequisitos de arranque (el PSSR más reciente).
        v_res := public.system_pssr_status(p_system_id);
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
                     AND p.status IN ('open', 'in_progress')
                     AND (v_cutoff IS NULL OR p.created_at < v_cutoff)) AS punches_open
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
      -- S11 (D-10): aprobado sin condiciones al que le apareció una condición nueva (p. ej. documento superado).
      WHEN v_appr ->> 'status' = 'approved' AND v_level = 'yellow' THEN 'approved_needs_review'
      WHEN v_appr IS NOT NULL THEN v_appr ->> 'status'
      WHEN v_level = 'green'  THEN 'ready'
      WHEN v_level = 'yellow' THEN 'ready_with_conditions'
      ELSE 'not_ready'
    END;
    RETURN NEXT;

    -- Solo un gate con todas sus firmas habilita al siguiente; S11 (D-02): si está en regresión, según la org.
    v_prev_state := CASE WHEN v_appr IS NULL OR v_appr ->> 'status' = 'pending_signatures' THEN 'missing'
                         WHEN v_level = 'red' THEN 'regressed' ELSE 'ok' END;
    v_first   := false;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_system_gates(p_system_id uuid)
 RETURNS TABLE(gate_id uuid, gate_code text, gate_name text, gate_order integer, gate_phase_id uuid, requires_previous boolean, approval_roles text[], required_signatures text[], cosign_roles text[], computed_level text, status text, criteria jsonb, approval jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.compute_system_gates_upto(p_system_id, NULL)
$function$;

CREATE OR REPLACE FUNCTION public.startup_prerequisites(p_system_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_proj uuid; v_org uuid; v_gate readiness_gates%ROWTYPE; v_appr text; v_pssr jsonb; v_regressed boolean;
BEGIN
  SELECT s.project_id, p.org_id INTO v_proj, v_org FROM systems s JOIN projects p ON p.id = s.project_id WHERE s.id = p_system_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(v_proj) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  -- S11 (E-07): el gate de arranque está marcado en la configuración (is_startup_gate). Sin marca, se infiere
  -- como antes pero nunca un gate que exige prueba de desempeño (esa prueba necesita la planta arrancada).
  SELECT * INTO v_gate FROM readiness_gates WHERE org_id = v_org AND is_active
   ORDER BY is_startup_gate DESC, (NOT requires_performance) DESC, requires_lineup DESC, order_index DESC, code DESC LIMIT 1;
  SELECT status INTO v_appr FROM system_gate_approvals WHERE system_id = p_system_id AND gate_id = v_gate.id AND revoked_at IS NULL;
  -- S11 (D-02): un gate aprobado pero en regresión no habilita el arranque.
  v_regressed := v_appr IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.compute_system_gates_upto(p_system_id, v_gate.order_index) cg WHERE cg.gate_id = v_gate.id AND cg.status = 'regressed');
  -- S11 (D-11): la misma regla PSSR que el gate (el más reciente).
  v_pssr := public.system_pssr_status(p_system_id);
  RETURN jsonb_build_object(
    'gate_id', v_gate.id, 'gate_code', v_gate.code,
    'gate_status', CASE WHEN v_regressed THEN 'regressed' ELSE COALESCE(v_appr, 'not_approved') END,
    'gate_ok', COALESCE(v_appr IN ('approved', 'approved_with_conditions'), false) AND NOT v_regressed,
    'pssr_number', v_pssr ->> 'review_number', 'pssr_status', COALESCE(v_pssr ->> 'review_status', 'none'),
    'pssr_ok', COALESCE(v_pssr ->> 'review_status' = 'approved', false));
END;
$function$;

CREATE OR REPLACE FUNCTION public.ownership_checklist(p_system_id uuid, p_to_stage text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    FROM lineup_sheets WHERE system_id = p_system_id AND status = 'verified' AND purpose = 'startup' ORDER BY public.lineup_is_stale(id), verified_at DESC LIMIT 1;
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
$function$;

CREATE OR REPLACE FUNCTION public.approve_system_gate(p_system_id uuid, p_gate_id uuid, p_conditions jsonb DEFAULT '[]'::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  FROM org_members om WHERE om.org_id = v_org AND om.user_id = auth.uid()
    AND public.is_project_member(v_project);
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
                                     conditions, evidence, notes, approved_by, approved_role, completed_at)
  VALUES (v_org, v_project, p_system_id, p_gate_id,
          CASE WHEN cardinality(v_gate.required_signatures) > 0 THEN 'pending_signatures' ELSE v_target END,
          v_target, v_conditions,
          jsonb_build_object('computed_level', v_row.computed_level, 'criteria', v_row.criteria,
                             'evaluated_at', now()),
          v_notes, auth.uid(), v_role,
          -- S11 (D-17): momento en que el gate quedó con todas sus firmas (KPI de compromisos).
          CASE WHEN cardinality(v_gate.required_signatures) > 0 THEN NULL ELSE now() END)
  RETURNING id INTO v_id;

  INSERT INTO system_gate_signatures (approval_id, org_id, project_id, capacity, user_id, user_role, comments)
  VALUES (v_id, v_org, v_project, 'commissioning', auth.uid(), v_role, v_notes);

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_system_gate(p_approval_id uuid, p_capacity text, p_comments text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  FROM org_members om WHERE om.org_id = v_appr.org_id AND om.user_id = auth.uid()
    AND public.is_project_member(v_appr.project_id);
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
       SET status = COALESCE(target_status, 'approved'), completed_at = now()  -- S11 (D-17)
     WHERE id = p_approval_id;
    RETURN COALESCE(v_appr.target_status, 'approved');
  END IF;

  RETURN 'pending_signatures';
END;
$function$;

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
             'on_time_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to AND due_date IS NOT NULL AND (done_at AT TIME ZONE v_tz)::date <= COALESCE(original_due_date, due_date)),
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
    -- S11 (D-17): denominador = compromisos que vencían en la ventana (cumplidos o no); a tiempo = gate con todas
    -- sus firmas (completed_at) en o antes de la fecha comprometida. approved_30d queda por compatibilidad.
    'commitments', (SELECT jsonb_build_object(
             'due_30d', COUNT(*),
             'approved_30d', COUNT(*) FILTER (WHERE a.completed_at IS NOT NULL),
             'on_time_30d', COUNT(*) FILTER (WHERE a.completed_at IS NOT NULL AND (a.completed_at AT TIME ZONE v_tz)::date <= gp.commitment_date))
           FROM system_gate_plans gp
           LEFT JOIN system_gate_approvals a ON a.system_id = gp.system_id AND a.gate_id = gp.gate_id AND a.revoked_at IS NULL
           WHERE gp.project_id = p_project_id AND gp.commitment_date > p_date - 30 AND gp.commitment_date <= p_date),
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

CREATE OR REPLACE FUNCTION public.escalate_constraint(p_constraint_id uuid, p_level integer, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_c project_constraints%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO v_c FROM project_constraints WHERE id = p_constraint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restricción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_c.project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_c.status <> 'open' THEN RAISE EXCEPTION 'Solo se escalan restricciones abiertas' USING ERRCODE = 'P0001'; END IF;
  IF p_level IS NULL OR p_level NOT BETWEEN 1 AND 4 OR p_level = v_c.escalation_level THEN
    RAISE EXCEPTION 'Nivel de escalamiento no válido' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo del cambio de nivel' USING ERRCODE = '22023'; END IF;
  -- S11 (D-14): bajar una restricción de nivel 3 o 4 es de líder o superior (si no, cualquiera desbloquea el gate).
  IF p_level < v_c.escalation_level AND v_c.escalation_level >= 3 AND v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo un líder o superior baja una restricción de nivel %', v_c.escalation_level USING ERRCODE = '42501';
  END IF;
  UPDATE project_constraints SET escalation_level = p_level, updated_at = now() WHERE id = p_constraint_id;
  PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id,
                          CASE WHEN p_level > v_c.escalation_level THEN 'escalated' ELSE 'deescalated' END,
                          v_c.escalation_level::text, p_level::text, v_reason);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_constraint(p_constraint_id uuid, p_title text, p_description text, p_system_id uuid, p_gate_id uuid, p_owner_id uuid, p_need_date date, p_impact_kind text, p_impact text, p_recovery_plan text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_c project_constraints%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO v_c FROM project_constraints WHERE id = p_constraint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restricción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_c.project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_c.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'La restricción % está cerrada y no se puede editar', v_c.number USING ERRCODE = 'P0001';
  END IF;
  IF p_system_id IS NULL OR p_owner_id IS NULL OR p_need_date IS NULL THEN
    RAISE EXCEPTION 'Sistema, responsable y fecha requerida son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF public.mgmt_text(p_title, 200) IS NULL OR public.mgmt_text(p_description) IS NULL THEN
    RAISE EXCEPTION 'Título y descripción son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(v_c.project_id, v_c.org_id, p_system_id, p_owner_id, p_gate_id);
  -- S11 (D-14): mover una restricción abierta a otro gate o sistema la saca del gate que bloquea: líder o
  -- superior y con motivo. Cambiar la fecha requerida exige motivo.
  IF v_c.status = 'open' AND (p_gate_id IS DISTINCT FROM v_c.gate_id OR p_system_id IS DISTINCT FROM v_c.system_id) THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
      RAISE EXCEPTION 'Solo un líder o superior cambia el gate o el sistema de una restricción abierta' USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo del cambio de gate o sistema' USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_need_date IS DISTINCT FROM v_c.need_date AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'Indica el motivo del cambio de fecha requerida' USING ERRCODE = '22023';
  END IF;

  UPDATE project_constraints SET title = public.mgmt_text(p_title, 200), description = public.mgmt_text(p_description),
         system_id = p_system_id, gate_id = p_gate_id, owner_id = p_owner_id, need_date = p_need_date,
         impact_kind = p_impact_kind, impact = public.mgmt_text(p_impact), recovery_plan = public.mgmt_text(p_recovery_plan),
         -- Una nueva fecha requerida reinicia el aviso de vencimiento.
         last_overdue_notif_at = CASE WHEN p_need_date IS DISTINCT FROM v_c.need_date THEN NULL ELSE last_overdue_notif_at END,
         updated_at = now()
   WHERE id = p_constraint_id;
  IF p_need_date IS DISTINCT FROM v_c.need_date THEN
    PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'need_date', v_c.need_date::text, p_need_date::text, v_reason);
  END IF;
  IF p_owner_id IS DISTINCT FROM v_c.owner_id THEN
    PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'reassigned', v_c.owner_id::text, p_owner_id::text);
  END IF;
  IF p_gate_id IS DISTINCT FROM v_c.gate_id OR p_system_id IS DISTINCT FROM v_c.system_id THEN
    PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'gate_changed',
                            concat_ws('/', v_c.system_id, v_c.gate_id), concat_ws('/', p_system_id, p_gate_id), v_reason);
  END IF;
  PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'updated');
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_constraint(p_constraint_id uuid, p_to text, p_comment text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_c project_constraints%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text; v_open integer;
BEGIN
  SELECT * INTO v_c FROM project_constraints WHERE id = p_constraint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restricción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_c.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  v_comment := public.mgmt_text(p_comment, 2000);

  IF p_to = 'cancelled' THEN
    IF v_c.status IN ('closed', 'cancelled') THEN RAISE EXCEPTION 'La restricción % ya está cerrada', v_c.number USING ERRCODE = 'P0001'; END IF;
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede cancelar restricciones', v_role USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la cancelación' USING ERRCODE = '22023'; END IF;
    UPDATE project_constraints SET status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancel_reason = v_comment, updated_at = now()
     WHERE id = p_constraint_id;

  ELSIF v_c.status = 'open' AND p_to = 'resolved' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Describe cómo se resolvió la restricción' USING ERRCODE = '22023'; END IF;
    UPDATE project_constraints SET status = 'resolved', resolution_note = v_comment, resolved_by = v_uid, resolved_at = now(), updated_at = now()
     WHERE id = p_constraint_id;

  ELSIF v_c.status = 'resolved' AND p_to = 'open' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué se reabre' USING ERRCODE = '22023'; END IF;
    UPDATE project_constraints SET status = 'open', resolved_by = NULL, resolved_at = NULL, updated_at = now() WHERE id = p_constraint_id;

  ELSIF v_c.status = 'resolved' AND p_to = 'closed' THEN
    -- S11 (D-14): cierra otra persona distinta de quien la resolvió.
    IF v_c.resolved_by = v_uid THEN RAISE EXCEPTION 'Cierra la restricción otra persona distinta de quien la resolvió' USING ERRCODE = '42501'; END IF;
    SELECT COUNT(*) INTO v_open FROM actions
     WHERE source_kind = 'constraint' AND source_id = p_constraint_id AND status IN ('open', 'in_progress', 'done');
    IF v_open > 0 THEN
      RAISE EXCEPTION 'La restricción % tiene % acción(es) sin verificar', v_c.number, v_open USING ERRCODE = 'P0001';
    END IF;
    UPDATE project_constraints SET status = 'closed', closed_by = v_uid, closed_at = now(), updated_at = now() WHERE id = p_constraint_id;

  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', v_c.status, p_to USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'transition', v_c.status, p_to, v_comment);
  RETURN p_to;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_action(p_action_id uuid, p_title text, p_description text, p_owner_id uuid, p_system_id uuid, p_due_date date, p_priority text, p_verification_method text, p_source_ref text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_a actions%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO v_a FROM actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_a.project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_a.status IN ('verified', 'cancelled') THEN
    RAISE EXCEPTION 'La acción % está cerrada y no se puede editar', v_a.number USING ERRCODE = 'P0001';
  END IF;
  IF p_owner_id IS NULL THEN RAISE EXCEPTION 'La acción necesita un responsable' USING ERRCODE = '22023'; END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(v_a.project_id, v_a.org_id, p_system_id, p_owner_id);
  -- S11 (D-15): replanificar exige motivo (el KPI «a tiempo» mide contra original_due_date) y el método de
  -- verificación no cambia una vez empezada la acción, salvo un líder o superior.
  IF v_a.due_date IS NOT NULL AND p_due_date IS DISTINCT FROM v_a.due_date AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'Indica el motivo del cambio de fecha' USING ERRCODE = '22023';
  END IF;
  IF p_verification_method IS DISTINCT FROM v_a.verification_method AND v_a.status <> 'open'
     AND v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo un líder o superior cambia el método de verificación de una acción empezada' USING ERRCODE = '42501';
  END IF;

  UPDATE actions SET title = public.mgmt_text(p_title, 200), description = public.mgmt_text(p_description),
         owner_id = p_owner_id, system_id = p_system_id, due_date = p_due_date,
         priority = p_priority, verification_method = p_verification_method,
         source_ref = public.mgmt_text(p_source_ref, 200), updated_at = now()
   WHERE id = p_action_id;
  IF p_owner_id IS DISTINCT FROM v_a.owner_id THEN
    PERFORM public.mgmt_log(v_a.org_id, v_a.project_id, 'action', p_action_id, 'reassigned', v_a.owner_id::text, p_owner_id::text);
  END IF;
  IF p_due_date IS DISTINCT FROM v_a.due_date THEN
    PERFORM public.mgmt_log(v_a.org_id, v_a.project_id, 'action', p_action_id, 'replanned', v_a.due_date::text, p_due_date::text, v_reason);
  END IF;
  PERFORM public.mgmt_log(v_a.org_id, v_a.project_id, 'action', p_action_id, 'updated');
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_gate_attestation(p_attestation_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_att system_gate_attestations%ROWTYPE;
  v_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 2000), '');
BEGIN
  SELECT * INTO v_att FROM system_gate_attestations WHERE id = p_attestation_id AND revoked_at IS NULL;
  IF NOT FOUND OR NOT public.is_project_editor(v_att.project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  -- S11 (D-21): con motivo y auditado; con el gate aprobado, el camino es revocar la aprobación.
  IF v_reason IS NULL OR length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Explica por qué se retira la declaración (mínimo 10 caracteres)' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM gate_criteria gc JOIN system_gate_approvals a ON a.gate_id = gc.gate_id
             WHERE gc.id = v_att.criterion_id AND a.system_id = v_att.system_id AND a.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'El gate ya está aprobado: revoca primero la aprobación' USING ERRCODE = 'P0001';
  END IF;
  UPDATE system_gate_attestations
     SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = v_reason
   WHERE id = p_attestation_id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_att.org_id, auth.uid(), 'gate_attestation', p_attestation_id, 'revoked',
          jsonb_build_object('systemId', v_att.system_id, 'criterionId', v_att.criterion_id, 'reason', v_reason));
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_system_dependency()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- S11 (D-35): ciclo por gates, no por sistemas. «S.g necesita P.r» y llegar al gate (S, x) necesita los
  -- anteriores de S. Hay ciclo si desde (P, r) se vuelve a S en un gate de orden ≥ al bloqueado: así «A.RFC
  -- necesita B.MC» y «B.RFSU necesita A.MC» conviven.
  IF EXISTS (
    WITH RECURSIVE up(sid, ord) AS (
      SELECT NEW.depends_on_system_id, (SELECT order_index FROM readiness_gates WHERE id = NEW.required_gate_id)
      UNION
      SELECT d.depends_on_system_id, rr.order_index
      FROM up
      JOIN system_dependencies d ON d.system_id = up.sid AND d.id IS DISTINCT FROM NEW.id
      JOIN readiness_gates rb ON rb.id = d.blocked_gate_id AND rb.order_index <= up.ord
      JOIN readiness_gates rr ON rr.id = d.required_gate_id
    )
    SELECT 1 FROM up WHERE sid = NEW.system_id
      AND ord >= (SELECT order_index FROM readiness_gates WHERE id = NEW.blocked_gate_id)
  ) THEN
    RAISE EXCEPTION 'La dependencia crea un ciclo entre gates de los sistemas' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 7. Permisos de las funciones nuevas o con firma nueva ────────────────
REVOKE ALL ON FUNCTION public.compute_system_gates_upto(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_system_gates_upto(uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.system_phase_level(uuid, uuid, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.system_phase_level(uuid, uuid, integer, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_constraint(uuid, text, text, uuid, uuid, uuid, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_constraint(uuid, text, text, uuid, uuid, uuid, date, text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_action(uuid, text, text, uuid, uuid, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_action(uuid, text, text, uuid, uuid, date, text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_gate_attestation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_gate_attestation(uuid, text) TO authenticated, service_role;
