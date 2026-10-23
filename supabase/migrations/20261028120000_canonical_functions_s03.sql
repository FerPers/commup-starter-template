-- S03 — SQL canónico (D-09 / B-19 / E-26 / F-35; de paso B-28). 2026-10-19.
--
-- Sin cambio de comportamiento. Desde aquí, el cuerpo que corre de cada función central está escrito
-- completo en un archivo: `supabase/functions-sql/<nombre>.sql` (volcado de prod con
-- `scripts/sql/canonical-functions.mjs dump`). Esta migración repite esos cuerpos tal cual, para que la
-- última definición en `migrations/` vuelva a ser la que corre (antes había que reproducir hasta 4
-- parches `replace(pg_get_functiondef(…))` encima de la última definición completa).
--
-- Reglas nuevas:
--   - Prohibido parchear por ancla: `src/lib/sql/no-anchor-patches.test.ts` falla si una migración
--     posterior a esta usa `pg_get_functiondef`.
--   - `tests/db/function-drift.test.ts` compara el md5 de cada archivo con `function_definition_md5`.
--   - Cambiar una función central = editar su archivo + `emit` a una migración nueva + `dump` al aplicar.
--
-- B-28: `itr_template_items_backup_pre_split` (respaldo del split bilingüe de 2026-09) se exportó a
-- `supabase/archive/itr_template_items_backup_pre_split.csv.gz` (6960 filas) y se elimina.

-- ── Deriva: md5 de la definición, nunca el cuerpo ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.function_definition_md5(p_signatures text[])
 RETURNS TABLE(signature text, md5 text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT s, md5(regexp_replace(pg_catalog.pg_get_functiondef(p.oid), '\s+$', ''))
  FROM unnest(p_signatures) AS s
  JOIN pg_catalog.pg_proc p ON p.oid = pg_catalog.to_regprocedure(s)
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE auth.uid() IS NOT NULL OR auth.role() = 'service_role';
$function$;
REVOKE EXECUTE ON FUNCTION public.function_definition_md5(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.function_definition_md5(text[]) TO authenticated, service_role;

-- ── Funciones canónicas (idénticas a prod al 2026-10-19) ──────────────────────────────────────────

-- compute_system_gates  (supabase/functions-sql/compute_system_gates.sql)
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


-- compute_project_gates  (supabase/functions-sql/compute_project_gates.sql)
CREATE OR REPLACE FUNCTION public.compute_project_gates(p_project_id uuid)
 RETURNS TABLE(system_id uuid, system_code text, system_name text, area_code text, area_name text, gates jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$;


-- my_work_counts  (supabase/functions-sql/my_work_counts.sql)
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
        and i.status <> 'approved'
        and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role = 'executor')
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
        and exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role = 'executor')
        and (a.role = 'supervisor' or exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role = 'supervisor'))
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
    ),
    'performance_to_decide', (
      select count(*)
      from performance_runs pr
      where pr.status = 'closed'
        and (select role from me) in ('owner', 'admin', 'architect', 'leader')
        and pr.project_id in (select id from proj)
    ),
    'performance_to_sign', (
      select count(*)
      from performance_certificates pc
      where pc.status = 'pending_signatures'
        and pc.project_id in (select id from proj)
        and auth.uid() is distinct from pc.commissioning_signed_by
        and auth.uid() is distinct from pc.operations_signed_by
        and auth.uid() is distinct from pc.client_signed_by
        and ((pc.operations_signed_by is null and (select role from me) = any (public.hold_release_roles('operations')))
          or (pc.client_signed_by is null and (select role from me) = 'client'))
    )
  );
$function$;


-- daily_report_data  (supabase/functions-sql/daily_report_data.sql)
CREATE OR REPLACE FUNCTION public.daily_report_data(p_project_id uuid, p_date date DEFAULT CURRENT_DATE, p_area_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
          LIMIT 30) q), '[]'::jsonb),
    -- F7: intentos de prueba de desempeño cerrados o con resultado del día, y certificados aceptados.
    'performance_today', COALESCE((SELECT jsonb_agg(x ORDER BY x ->> 'at') FROM (
          SELECT jsonb_build_object('kind', 'run', 'number', pr.number, 'title', pt.title, 'system', ds.code,
                   'status', pr.status, 'result', pr.result, 'early_close', pr.early_close, 'at', COALESCE(pr.result_at, pr.closed_at)) AS x
          FROM performance_runs pr JOIN performance_tests pt ON pt.id = pr.test_id JOIN _dr_sys ds ON ds.id = pt.primary_system_id
          WHERE pr.project_id = p_project_id
            AND ((pr.closed_at >= v_from AND pr.closed_at < v_to) OR (pr.result_at >= v_from AND pr.result_at < v_to))
          UNION ALL
          SELECT jsonb_build_object('kind', 'certificate', 'number', pc.number, 'title', pt.title, 'system', ds.code,
                   'status', pc.status, 'at', GREATEST(pc.operations_signed_at, pc.client_signed_at))
          FROM performance_certificates pc JOIN performance_tests pt ON pt.id = pc.test_id JOIN _dr_sys ds ON ds.id = pc.system_id
          WHERE pc.project_id = p_project_id AND pc.status = 'accepted'
            AND GREATEST(pc.operations_signed_at, pc.client_signed_at) >= v_from AND GREATEST(pc.operations_signed_at, pc.client_signed_at) < v_to
          LIMIT 30) q), '[]'::jsonb)
  );
  RETURN v_out;
END;
$function$;


-- take_mgmt_snapshot  (supabase/functions-sql/take_mgmt_snapshot.sql)
CREATE OR REPLACE FUNCTION public.take_mgmt_snapshot(p_project_id uuid, p_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
             AND a.approved_at >= v_from AND a.approved_at < v_to),
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


-- sign_itr_atomic  (supabase/functions-sql/sign_itr_atomic.sql)
CREATE OR REPLACE FUNCTION public."sign_itr_atomic"(p_itr_id uuid, p_role text, p_signature_image text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.itrs; e jsonb; roles text[]:=ARRAY['executor','supervisor','client']; uid uuid:=auth.uid(); org uuid; result_status text; eq_block text;
BEGIN
SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid) THEN RAISE EXCEPTION 'Membership required'; END IF;
IF p_role IS NULL OR NOT p_role=ANY(roles) THEN RAISE EXCEPTION 'Invalid signing role'; END IF;
IF v.status='approved' THEN RAISE EXCEPTION 'Already approved'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.itr_assignments WHERE itr_id=p_itr_id AND role::text=p_role AND user_id=uid) THEN RAISE EXCEPTION 'User not assigned to signing role'; END IF;
IF EXISTS(SELECT 1 FROM public.itr_signatures s WHERE s.itr_id=p_itr_id AND NOT EXISTS(SELECT 1 FROM public.itr_assignments a WHERE a.itr_id=p_itr_id AND a.role=s.role AND a.user_id=s.user_id)) THEN RAISE EXCEPTION 'Existing signature assignment mismatch'; END IF;
IF EXISTS(SELECT 1 FROM unnest(roles[1:array_position(roles,p_role)-1]) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN RAISE EXCEPTION 'Previous signature required'; END IF;
e:=public.evaluate_itr_capture(p_itr_id);
IF NOT COALESCE((e->>'is_complete')::boolean,false) OR COALESCE((e->>'has_critical_fail')::boolean,true) THEN RAISE EXCEPTION 'Applicable content incomplete or rejected'; END IF;
eq_block:=public.itr_test_equipment_blocker(p_itr_id);
IF eq_block IS NOT NULL THEN RAISE EXCEPTION '%', eq_block; END IF;
-- Fase 8: no se firma contra una revisión de documento superada.
eq_block:=public.document_references_blocker('itr',p_itr_id);
IF eq_block IS NOT NULL THEN RAISE EXCEPTION '%', eq_block; END IF;
INSERT INTO public.itr_signatures(itr_id,user_id,role,signature_image) VALUES(p_itr_id,uid,p_role::public.signature_role,p_signature_image);
result_status:=CASE WHEN (SELECT count(DISTINCT role) FROM public.itr_signatures WHERE itr_id=p_itr_id)=3 THEN 'approved' ELSE 'completed' END;
UPDATE public.itrs SET status=result_status::public.itr_status,progress_pct=100,completed_date=CURRENT_DATE WHERE id=p_itr_id;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'signed',jsonb_build_object('role',p_role,'status',result_status));
IF result_status='approved' THEN
UPDATE public.work_plan_items SET status='completed' WHERE itr_id=p_itr_id AND status::text IN ('not_started','in_progress');
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'approved',jsonb_build_object('projectId',v.project_id,'tagId',v.tag_id,'signingRole',p_role));
END IF;
RETURN jsonb_build_object('status',result_status,'project_id',v.project_id,'tag_id',v.tag_id);
END $function$;


-- seed_default_gate_for_phase  (supabase/functions-sql/seed_default_gate_for_phase.sql)
CREATE OR REPLACE FUNCTION public.seed_default_gate_for_phase(p_phase_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO readiness_gates (org_id, code, name, order_index, phase_id, requires_previous, requires_lineup)
  VALUES (v_phase.org_id, v_code, v_phase.name, v_phase.order_index * 10, v_phase.id, NOT v_first,
          v_code = 'RFSU' OR upper(btrim(v_phase.code)) = 'SU')
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
$function$;


-- evaluate_itr_capture  (supabase/functions-sql/evaluate_itr_capture.sql)
CREATE OR REPLACE FUNCTION public.evaluate_itr_capture(p_itr_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH RECURSIVE
items AS MATERIALIZED (
  SELECT i.*, r.value_text, r.value_numeric, r.value_bool, r.value_option, r.remarks,
    i.option_outcomes ->> r.value_option AS selection_outcome,
    CASE WHEN i.item_type::text='continuity' THEN public.evaluate_itr_continuity(r.value_text) END AS continuity,
    CASE WHEN i.item_type::text='table' THEN public.evaluate_itr_table(i.options, r.value_text, pg_catalog.jsonb_array_length(itr.source_rows)) END AS table_eval,
    CASE WHEN i.item_type::text='select' THEN CASE i.option_outcomes ->> r.value_option WHEN 'pass' THEN true WHEN 'fail' THEN false ELSE NULL END
    WHEN i.item_type::text='measurement' AND r.value_numeric IS NOT NULL
      AND (i.acceptance_min IS NOT NULL OR i.acceptance_max IS NOT NULL)
      THEN r.value_numeric::text NOT IN ('NaN','Infinity','-Infinity')
        AND (i.acceptance_min IS NULL OR r.value_numeric>=i.acceptance_min)
        AND (i.acceptance_max IS NULL OR r.value_numeric<=i.acceptance_max)
      ELSE r.is_passed END AS is_passed,
    CASE i.item_type::text
      WHEN 'checkbox' THEN r.value_bool::text
      WHEN 'yes_no' THEN r.value_bool::text
      WHEN 'number' THEN pg_catalog.trim_scale(r.value_numeric)::text
      WHEN 'measurement' THEN pg_catalog.trim_scale(r.value_numeric)::text
      WHEN 'select' THEN r.value_option
      ELSE r.value_text
    END AS condition_actual,
    COALESCE(r.value_numeric IS NOT NULL AND r.value_numeric::text NOT IN ('NaN', 'Infinity', '-Infinity'), false) AS finite_number,
    EXISTS (
      SELECT 1 FROM public.itr_attachments a
      WHERE a.itr_id = p_itr_id AND a.item_id = i.id
        AND a.file_url ~ '[^[:space:]]' AND a.file_type LIKE 'image/%'
    ) AS has_photo,
    EXISTS (
      SELECT 1 FROM public.itr_attachments a
      WHERE a.itr_id = p_itr_id AND a.item_id = i.id
        AND a.file_url ~ '[^[:space:]]' AND a.file_type = 'application/pdf'
    ) AS has_document
  FROM public.itrs itr
  JOIN public.itr_template_items i ON i.template_id = itr.template_id
  LEFT JOIN public.itr_responses r ON r.itr_id = itr.id AND r.item_id = i.id
  WHERE itr.id = p_itr_id
),
walk AS (
  SELECT i.id AS origin, i.id, i.condition_item_id, i.condition_value,
    ARRAY[i.id] AS path, true AS matches
  FROM items i
  UNION ALL
  SELECT w.origin, p.id, p.condition_item_id, p.condition_value,
    w.path || p.id,
    w.matches AND COALESCE(p.condition_actual = w.condition_value, false)
  FROM walk w
  JOIN items p ON p.id = w.condition_item_id
  WHERE NOT p.id = ANY(w.path)
),
visibility AS (
  SELECT w.origin,
    bool_or(w.condition_item_id IS NOT NULL AND (
      w.condition_value IS NULL OR w.condition_item_id = ANY(w.path)
      OR NOT EXISTS (SELECT 1 FROM items p WHERE p.id = w.condition_item_id)
    )) AS invalid,
    bool_and(w.matches) AND bool_or(w.condition_item_id IS NULL) AS applicable
  FROM walk w GROUP BY w.origin
),
evaluated AS (
  SELECT i.id, (i.is_required OR i.selection_outcome='not_applicable') IS TRUE AS is_required, i.is_critical, i.is_passed, i.selection_outcome, i.continuity, i.table_eval,
    v.invalid, v.applicable AND NOT v.invalid AS applicable,
    COALESCE(
      (NOT i.requires_photo OR i.has_photo)
      AND (NOT i.requires_document OR i.has_document)
      AND (NOT i.requires_measurement OR i.finite_number)
      AND CASE i.item_type::text
        WHEN 'continuity' THEN (i.continuity->>'is_complete')::boolean
        WHEN 'table' THEN (i.table_eval->>'is_complete')::boolean
        WHEN 'text' THEN i.value_text ~ '[^[:space:]]'
        WHEN 'number' THEN i.finite_number
        WHEN 'measurement' THEN i.finite_number
        WHEN 'checkbox' THEN i.value_bool IS NOT NULL
        WHEN 'yes_no' THEN i.value_bool IS NOT NULL
        WHEN 'select' THEN i.value_option ~ '[^[:space:]]'
          AND pg_catalog.jsonb_typeof(i.options) = 'array'
          AND i.options @> pg_catalog.jsonb_build_array(i.value_option)
          AND (i.selection_outcome IS DISTINCT FROM 'not_applicable' OR i.remarks ~ '[^[:space:]]')
        WHEN 'date' THEN i.value_text ~ '^\d{4}-\d{2}-\d{2}$'
          AND pg_catalog.pg_input_is_valid(i.value_text, 'date')
        WHEN 'photo' THEN i.has_photo
        ELSE false
      END, false
    ) AS filled
  FROM items i JOIN visibility v ON v.origin = i.id
),
counts AS (
  SELECT count(*) FILTER (WHERE applicable) AS applicable_count,
    count(*) FILTER (WHERE applicable AND is_required) AS required_count,
    count(*) FILTER (WHERE applicable AND filled) AS completed_count,
    count(*) FILTER (WHERE applicable AND is_required AND filled) AS completed_required_count,
    count(*) FILTER (WHERE invalid) AS invalid_count,
    COALESCE(bool_or(applicable AND ((is_critical AND is_passed IS FALSE) OR selection_outcome='fail' OR (continuity->>'has_fail')::boolean OR (table_eval->>'has_fail')::boolean)), false) AS has_critical_fail,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE applicable), '[]'::jsonb) AS applicable_item_ids,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE invalid), '[]'::jsonb) AS invalid_condition_item_ids,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE applicable AND is_required AND NOT filled), '[]'::jsonb) AS missing_required_item_ids
  FROM evaluated
), result AS (
  SELECT *, applicable_count > 0 AND invalid_count = 0
    AND completed_required_count = required_count AS is_complete FROM counts
)
SELECT pg_catalog.jsonb_build_object(
  'is_complete', is_complete,
  'progress_pct', CASE WHEN is_complete THEN 100 WHEN required_count > 0
    THEN LEAST(99, FLOOR(completed_required_count::numeric * 100 / required_count)) ELSE 0 END,
  'has_critical_fail', has_critical_fail,
  'applicable_count', applicable_count,
  'required_count', required_count,
  'completed_count', completed_count,
  'completed_required_count', completed_required_count,
  'applicable_item_ids', applicable_item_ids,
  'invalid_condition_item_ids', invalid_condition_item_ids,
  'missing_required_item_ids', missing_required_item_ids
) FROM result;
$function$;


-- transition_procedure_revision  (supabase/functions-sql/transition_procedure_revision.sql)
CREATE OR REPLACE FUNCTION public.transition_procedure_revision(p_revision_id uuid, p_to text, p_comment text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r procedure_revisions%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text := public.mgmt_text(p_comment, 2000); v_prev uuid; v_doc text;
BEGIN
  SELECT * INTO r FROM procedure_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF r.status = 'draft' AND p_to = 'in_review' THEN
    IF NOT EXISTS (SELECT 1 FROM procedure_steps WHERE revision_id = r.id) THEN
      RAISE EXCEPTION 'El procedimiento necesita al menos un paso en la secuencia' USING ERRCODE = 'P0001';
    END IF;
    -- Fase 8: no se envía ni aprueba contra una revisión de documento superada.
    v_doc := public.document_references_blocker('procedure_revision', r.id);
    IF v_doc IS NOT NULL THEN RAISE EXCEPTION '%', v_doc USING ERRCODE = 'P0001'; END IF;
    IF r.rev > 0 AND public.mgmt_text(r.change_reason) IS NULL THEN RAISE EXCEPTION 'Indica el motivo del cambio de la revisión' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_revisions SET status = 'in_review', submitted_by = v_uid, submitted_at = now(), returned_reason = NULL, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'draft' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué se devuelve' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_revisions SET status = 'draft', returned_reason = v_comment, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'approved' THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores aprueban procedimientos' USING ERRCODE = '42501'; END IF;
    IF v_uid = r.created_by OR v_uid = r.submitted_by THEN RAISE EXCEPTION 'Aprueba una persona distinta de quien redactó el procedimiento' USING ERRCODE = '42501'; END IF;
    -- Fase 8: no se envía ni aprueba contra una revisión de documento superada.
    v_doc := public.document_references_blocker('procedure_revision', r.id);
    IF v_doc IS NOT NULL THEN RAISE EXCEPTION '%', v_doc USING ERRCODE = 'P0001'; END IF;
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
$function$;


-- add_mgmt_attachment  (supabase/functions-sql/add_mgmt_attachment.sql)
CREATE OR REPLACE FUNCTION public.add_mgmt_attachment(p_entity_kind text, p_entity_id uuid, p_file_path text, p_file_name text, p_mime_type text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_org uuid; v_status text; v_role text; v_id uuid;
BEGIN
  IF p_entity_kind = 'action' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM actions WHERE id = p_entity_id;
  ELSIF p_entity_kind = 'constraint' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM project_constraints WHERE id = p_entity_id;
  ELSIF p_entity_kind = 'tq' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM technical_queries WHERE id = p_entity_id;
  ELSIF p_entity_kind = 'decision' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM decisions WHERE id = p_entity_id;
  -- Fase 8: evidencia del vendor (reportes inmutables y FAT/SAT); el paquete no debe estar cancelado.
  ELSIF p_entity_kind = 'vendor_report' THEN
    SELECT r.project_id, p.org_id, CASE WHEN p.status = 'cancelled' THEN 'cancelled' END INTO v_project, v_org, v_status
    FROM vendor_reports r JOIN vendor_packages p ON p.id = r.package_id WHERE r.id = p_entity_id;
  ELSIF p_entity_kind = 'vendor_activity' THEN
    SELECT a.project_id, p.org_id, CASE WHEN p.status = 'cancelled' THEN 'cancelled' END INTO v_project, v_org, v_status
    FROM vendor_activities a JOIN vendor_packages p ON p.id = a.package_id WHERE a.id = p_entity_id;
  ELSE
    RAISE EXCEPTION 'Tipo no válido' USING ERRCODE = '22023';
  END IF;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_project);
  -- client solo adjunta en TQ (soporte de su respuesta).
  IF auth.uid() IS NULL OR v_role IS NULL OR (v_role = 'client' AND p_entity_kind <> 'tq') THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF v_status IN ('verified', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'El registro está cerrado: no admite más evidencia' USING ERRCODE = 'P0001';
  END IF;
  IF p_file_path IS NULL
     OR p_file_path NOT LIKE v_project::text || '/' || p_entity_kind || '/' || p_entity_id::text || '/%'
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'mgmt-evidence' AND o.name = p_file_path) THEN
    RAISE EXCEPTION 'Adjunto de evidencia no válido' USING ERRCODE = '22023';
  END IF;
  IF public.mgmt_text(p_file_name, 255) IS NULL THEN RAISE EXCEPTION 'Nombre de archivo obligatorio' USING ERRCODE = '22023'; END IF;

  INSERT INTO mgmt_attachments (org_id, project_id, entity_kind, entity_id, file_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (v_org, v_project, p_entity_kind, p_entity_id, p_file_path, public.mgmt_text(p_file_name, 255),
          left(p_mime_type, 100), p_size_bytes, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.mgmt_log(v_org, v_project, p_entity_kind, p_entity_id, 'attachment', NULL, NULL, public.mgmt_text(p_file_name, 255));
  RETURN v_id;
END;
$function$;


-- update_punch_ops_status  (supabase/functions-sql/update_punch_ops_status.sql)
CREATE OR REPLACE FUNCTION public.update_punch_ops_status(p_punch_id uuid, p_new_status text, p_notes text DEFAULT NULL::text, p_target_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  v_cur_status TEXT;
BEGIN
  SELECT pu.project_id, pu.post_handover_status
    INTO v_project_id, v_cur_status
    FROM punches pu WHERE pu.id = p_punch_id;

  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Punch not found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT is_project_member(v_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_cur_status IS NULL OR v_cur_status = 'active' THEN
    RAISE EXCEPTION 'El punch no está transferido a Operaciones' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_status NOT IN (
    'in_progress_ops','deferred','resolved_ops','verified_ops','closed_final','cancelled_ops'
  ) THEN
    RAISE EXCEPTION 'Invalid post-handover status: %', p_new_status;
  END IF;

  UPDATE punches SET
    post_handover_status = p_new_status,
    ops_notes            = COALESCE(p_notes, ops_notes),
    ops_target_date      = COALESCE(p_target_date, ops_target_date),
    closed_date          = CASE WHEN p_new_status = 'closed_final' THEN CURRENT_DATE ELSE closed_date END,
    status               = CASE WHEN p_new_status = 'closed_final' THEN 'closed'::punch_status ELSE status END
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id,
    CASE WHEN p_new_status = 'closed_final' THEN 'closed' ELSE 'status_change' END,
    v_cur_status, p_new_status, auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$function$;


-- approve_system_gate  (supabase/functions-sql/approve_system_gate.sql)
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
$function$;


-- sign_system_gate  (supabase/functions-sql/sign_system_gate.sql)
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
       SET status = COALESCE(target_status, 'approved')
     WHERE id = p_approval_id;
    RETURN COALESCE(v_appr.target_status, 'approved');
  END IF;

  RETURN 'pending_signatures';
END;
$function$;


-- ── B-28 ──────────────────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.itr_template_items_backup_pre_split;
