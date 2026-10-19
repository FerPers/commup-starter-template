-- fn: public.compute_system_gates(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.compute_system_gates(p_system_id uuid)
 RETURNS TABLE(gate_id uuid, gate_code text, gate_name text, gate_order integer, gate_phase_id uuid, requires_previous boolean, approval_roles text[], required_signatures text[], cosign_roles text[], computed_level text, status text, criteria jsonb, approval jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      JOIN tags tg ON tg.id = i.tag_id
      JOIN subsystems ss ON ss.id = tg.subsystem_id
      WHERE ss.system_id = p_system_id AND dr.revision_id <> d.current_revision_id
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
      WHERE pt.primary_system_id = p_system_id;
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'criterion_id', NULL, 'kind', 'performance_accepted', 'label', NULL, 'blocking', true,
        'result', CASE WHEN v_failn = 0 THEN 'pass' ELSE 'fail' END,
        'detail', jsonb_build_object('not_applicable', v_total = 0, 'tests', v_fail, 'missing_count', v_failn)));
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
             'approved_by', a.approved_by, 'approved_role', a.approved_role, 'approved_company', a.approved_company, 'approved_at', a.approved_at,
             'signatures', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'capacity', s.capacity, 'user_id', s.user_id, 'user_role', s.user_role, 'signer_company', s.signer_company,
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
$function$;
