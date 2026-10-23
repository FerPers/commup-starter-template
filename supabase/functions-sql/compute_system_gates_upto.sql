-- fn: public.compute_system_gates_upto(uuid,integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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

    -- R5: requisitos generados. Un ITR requerido (matriz aceptada × alcance × excepciones) que todavía no existe
    -- era invisible para la liberación. Lee el registro materializado (tag_requirement_rows) de la fase del gate;
    -- la política de la org decide si es condición (defecto), bloqueo o no cuenta. `stale` = el registro del
    -- proyecto espera un recálculo (cron cada minuto).
    IF g.phase_id IS NOT NULL AND v_pol ->> 'missing_requirements' <> 'off' THEN
      SELECT COUNT(*)::int, COUNT(DISTINCT r.tag_id)::int,
             COALESCE(jsonb_agg(jsonb_build_object('tag_id', r.tag_id, 'tag_number', r.tag_number, 'template_code', r.template_code)
               ORDER BY r.template_code, r.tag_number) FILTER (WHERE r.rn <= 20), '[]'::jsonb)
        INTO v_failn, v_total, v_fail
      FROM (
        SELECT rr.tag_id, t.tag_number, rr.template_code, row_number() OVER (ORDER BY rr.template_code, t.tag_number) AS rn
        FROM tag_requirement_rows rr JOIN subsystems ss ON ss.id = rr.subsystem_id JOIN tags t ON t.id = rr.tag_id
        WHERE ss.system_id = p_system_id AND rr.phase_id = g.phase_id AND rr.state = 'missing'
      ) r;
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'requirements_generated', 'label', NULL,
        'blocking', v_pol ->> 'missing_requirements' = 'block',
        'result', CASE WHEN v_failn = 0 THEN 'pass' WHEN v_pol ->> 'missing_requirements' = 'block' THEN 'fail' ELSE 'warn' END,
        'detail', jsonb_build_object('missing_count', v_failn, 'tags_count', v_total, 'missing', v_fail,
          'stale', NOT EXISTS (SELECT 1 FROM systems s JOIN tag_requirement_state st ON st.project_id = s.project_id
                               WHERE s.id = p_system_id AND st.computed_version >= st.version))));
      IF v_failn > 0 AND v_pol ->> 'missing_requirements' = 'block' THEN
        v_level := 'red';
      ELSIF v_failn > 0 AND v_level = 'green' THEN
        v_level := 'yellow';
      END IF;
    END IF;

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
