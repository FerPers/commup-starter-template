-- fn: public.generate_handover_package(uuid,uuid[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.generate_handover_package(p_project_id uuid, p_system_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- S24 (D17, E-05/F-22): paquete de handover v3 — todo F1–F8 por sistema, con firmas (nombre + empresa congelada) y hashes.
-- S25: comentario de liberación de holds, línea de tiempo de la ejecución, competencias sin anuladas y reconocimientos del traspaso.
DECLARE
  v_org_id  uuid;
  v_scope   uuid[];
  v_project jsonb;
  v_systems jsonb;
  v_punches jsonb;
  v_certs   jsonb;
BEGIN
  SELECT p.org_id INTO v_org_id FROM projects p WHERE p.id = p_project_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(s.id), '{}') INTO v_scope FROM systems s
  WHERE s.project_id = p_project_id
    AND (p_system_ids IS NULL OR cardinality(p_system_ids) = 0 OR s.id = ANY (p_system_ids));

  SELECT jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code, 'client', p.client, 'location', p.location,
           'status', p.status, 'start_date', p.start_date, 'end_date', p.end_date, 'timezone', p.timezone,
           'org_name', o.name)
  INTO v_project FROM projects p JOIN organizations o ON o.id = p.org_id WHERE p.id = p_project_id;

  WITH gates AS (
    -- Estado de gates del motor (refresca los sucios); service role no pasa por la verificación de pertenencia.
    SELECT g.system_id, g.gates FROM public.compute_project_gates(p_project_id) g WHERE g.system_id = ANY (v_scope)
  ),
  sys_sub AS (
    SELECT sub.system_id, sub.id AS subsystem_id FROM subsystems sub WHERE sub.system_id = ANY (v_scope)
  ),
  sys_tags AS (
    SELECT ss.system_id, t.* FROM sys_sub ss JOIN tags t ON t.subsystem_id = ss.subsystem_id
  ),
  sys_itrs AS (
    -- Con tag, cuenta el subsistema del tag; sin tag, el del ITR (igual que v2).
    SELECT ss.system_id, i.*, t.tag_number
    FROM itrs i LEFT JOIN tags t ON t.id = i.tag_id
    JOIN sys_sub ss ON ss.subsystem_id = COALESCE(t.subsystem_id, i.subsystem_id)
    WHERE i.project_id = p_project_id
  ),
  sys_punches AS (
    SELECT ss.system_id, pu.* FROM sys_sub ss JOIN punches pu ON pu.subsystem_id = ss.subsystem_id AND pu.project_id = p_project_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'system_id',   s.id,
      'code',        s.code,
      'name',        s.name,
      'description', s.description,
      'tag_count',    (SELECT count(*) FROM sys_tags st WHERE st.system_id = s.id),
      'itr_count',    (SELECT count(*) FROM sys_itrs si WHERE si.system_id = s.id),
      'itr_approved', (SELECT count(*) FROM sys_itrs si WHERE si.system_id = s.id AND si.status = 'approved'),
      'punch_summary', jsonb_build_object(
        'cat_a_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'A' AND sp.status IN ('open', 'in_progress')),
        'cat_b_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'B' AND sp.status IN ('open', 'in_progress')),
        'cat_c_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'C' AND sp.status IN ('open', 'in_progress')),
        'total_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.status IN ('open', 'in_progress'))),
      'itrs', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'itr_id', si.id, 'itr_number', si.itr_number, 'status', si.status, 'progress_pct', si.progress_pct,
          'scheduled_date', si.scheduled_date, 'completed_date', si.completed_date, 'tag_number', si.tag_number,
          'signatures', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('role', sig.role, 'user_id', sig.user_id, 'name', public.profile_full_name(sig.user_id),
                     'company', sig.signer_company, 'signed_at', sig.signed_at, 'signature_url', sig.signature_url) ORDER BY sig.signed_at)
            FROM itr_signatures sig WHERE sig.itr_id = si.id), '[]'::jsonb)
        ) ORDER BY si.itr_number)
        FROM sys_itrs si WHERE si.system_id = s.id), '[]'::jsonb),
      'tags', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'tag_id', st.id, 'tag_number', st.tag_number, 'description', st.description, 'manufacturer', st.manufacturer,
          'model', st.model, 'serial_number', st.serial_number, 'status', st.status, 'criticality', st.criticality
        ) ORDER BY st.tag_number)
        FROM sys_tags st WHERE st.system_id = s.id), '[]'::jsonb),

      -- Etapa de propiedad vigente (F6).
      'ownership', (SELECT jsonb_build_object('stage', so.stage, 'since', so.since) FROM system_ownership so WHERE so.system_id = s.id),

      -- Gates: estado calculado + aprobación vigente con multifirma + declaraciones manuales vigentes.
      'gates', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'gate_id', ge ->> 'gate_id', 'code', ge ->> 'code', 'name', ge ->> 'name', 'order', (ge ->> 'order')::int,
          'status', ge ->> 'status',
          'approval', (
            SELECT jsonb_build_object(
              'status', a.status, 'approved_by', public.profile_full_name(a.approved_by), 'approved_role', a.approved_role,
              'company', a.approved_company, 'approved_at', a.approved_at, 'completed_at', a.completed_at,
              'conditions', a.conditions, 'notes', a.notes,
              'signatures', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('capacity', sg.capacity, 'name', public.profile_full_name(sg.user_id),
                         'company', sg.signer_company, 'signed_at', sg.signed_at, 'comments', sg.comments) ORDER BY sg.signed_at)
                FROM system_gate_signatures sg WHERE sg.approval_id = a.id), '[]'::jsonb))
            FROM system_gate_approvals a
            WHERE a.system_id = s.id AND a.gate_id = (ge ->> 'gate_id')::uuid AND a.revoked_at IS NULL
            ORDER BY a.approved_at DESC LIMIT 1),
          'attestations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('criterion', gc.kind, 'label', gc.params ->> 'label', 'comment', at.comment,
                     'file_path', at.file_path, 'by', public.profile_full_name(at.attested_by), 'at', at.attested_at) ORDER BY at.attested_at)
            FROM system_gate_attestations at JOIN gate_criteria gc ON gc.id = at.criterion_id
            WHERE at.system_id = s.id AND gc.gate_id = (ge ->> 'gate_id')::uuid AND at.revoked_at IS NULL), '[]'::jsonb)
        ) ORDER BY (ge ->> 'order')::int, ge ->> 'code')
        FROM gates gg, jsonb_array_elements(gg.gates) ge WHERE gg.system_id = s.id), '[]'::jsonb),

      -- PSSR del sistema con firmas por capacidad y resumen de ítems.
      'pssr', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'review_id', r.id, 'review_number', r.review_number, 'title', r.title, 'status', r.status,
          'submitted_by', public.profile_full_name(r.submitted_by), 'submitted_at', r.submitted_at,
          'approved_by', public.profile_full_name(r.approved_by), 'approved_at', r.approved_at,
          'items', (SELECT jsonb_build_object('total', count(*), 'yes', count(*) FILTER (WHERE it.status = 'si'),
                      'na', count(*) FILTER (WHERE it.status = 'na'), 'no', count(*) FILTER (WHERE it.status = 'no'))
                    FROM pssr_review_items it WHERE it.review_id = r.id),
          'signatures', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('capacity', ps.capacity, 'discipline', ps.discipline,
                     'name', public.profile_full_name(ps.user_id), 'signed_at', ps.signed_at) ORDER BY ps.signed_at)
            FROM pssr_signatures ps WHERE ps.review_id = r.id), '[]'::jsonb)
        ) ORDER BY r.created_at)
        FROM pssr_reviews r WHERE r.system_id = s.id), '[]'::jsonb),

      -- Procedimientos: revisión vigente (hash, verificación en campo) y última ejecución completada con pasos y holds.
      'procedures', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'procedure_id', pr.id, 'number', pr.number, 'title', pr.title, 'kind', pr.kind,
          'revision', (
            SELECT jsonb_build_object('revision_id', rv.id, 'rev', rv.rev, 'status', rv.status,
                     'approved_by', public.profile_full_name(rv.approved_by), 'approved_at', rv.approved_at,
                     'field_verified_by', public.profile_full_name(rv.field_verified_by), 'field_verified_at', rv.field_verified_at,
                     'walkdown_note', rv.walkdown_note, 'content_hash', rv.content_hash)
            FROM procedure_revisions rv WHERE rv.id = pr.current_revision_id),
          'last_run', (
            SELECT jsonb_build_object('run_id', ru.id, 'number', ru.number, 'status', ru.status,
                     'started_by', public.profile_full_name(ru.started_by), 'started_at', ru.started_at,
                     'completed_by', public.profile_full_name(ru.completed_by), 'completed_at', ru.completed_at,
                     'steps', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object('ord', rs.ord, 'action', ps.action, 'expected', ps.expected_value,
                                'expected_min', ps.expected_min, 'expected_max', ps.expected_max, 'expected_unit', ps.expected_unit,
                                'actual', rs.actual_value, 'out_of_range', rs.out_of_range, 'status', rs.status, 'comment', rs.comment,
                                'hold', ps.is_hold_point, 'done_by', public.profile_full_name(rs.done_by), 'done_at', rs.done_at,
                                'released_by', public.profile_full_name(rs.released_by), 'released_at', rs.released_at,
                                'release_role', rs.release_role, 'release_comment', rs.release_comment) ORDER BY rs.ord)
                       FROM procedure_run_steps rs JOIN procedure_steps ps ON ps.id = rs.step_id
                       WHERE rs.run_id = ru.id), '[]'::jsonb),
                     'timeline', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object('kind', ev.kind, 'by', public.profile_full_name(ev.user_id),
                                'at', COALESCE(ev.field_at, ev.recorded_at), 'comment', ev.comment) ORDER BY COALESCE(ev.field_at, ev.recorded_at))
                       FROM procedure_run_events ev WHERE ev.run_id = ru.id), '[]'::jsonb))
            FROM procedure_runs ru WHERE ru.procedure_id = pr.id AND ru.status = 'completed'
            ORDER BY ru.completed_at DESC LIMIT 1)
        ) ORDER BY pr.number)
        FROM procedures pr WHERE pr.system_id = s.id), '[]'::jsonb),

      -- Line-ups verificados vigentes (no reemplazados) con sus posiciones.
      'lineups', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'sheet_id', ls.id, 'number', ls.number, 'title', ls.title, 'status', ls.status,
          'issued_by', public.profile_full_name(ls.issued_by), 'issued_at', ls.issued_at,
          'verified_by', public.profile_full_name(ls.verified_by), 'verified_at', ls.verified_at, 'content_hash', ls.content_hash,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('ord', li.ord, 'tag', t.tag_number, 'label', li.label,
                     'required', li.required_position, 'found', li.found_position, 'as_found', li.as_found_position,
                     'lock_number', li.lock_number, 'seal_number', li.seal_number, 'critical', li.is_critical, 'remarks', li.remarks,
                     'set_by', public.profile_full_name(li.set_by), 'set_at', li.set_at,
                     'verified_by', public.profile_full_name(li.verified_by), 'verified_at', li.verified_at) ORDER BY li.ord)
            FROM lineup_items li LEFT JOIN tags t ON t.id = li.tag_id WHERE li.sheet_id = ls.id), '[]'::jsonb)
        ) ORDER BY ls.number)
        FROM lineup_sheets ls WHERE ls.system_id = s.id AND ls.status = 'verified'), '[]'::jsonb),

      -- Bitácora de arranque: hitos y eventos no anulados, con testigo y parámetros.
      'startup_events', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'number', ev.number, 'kind', ev.kind, 'milestone', ev.milestone, 'category', ev.category, 'occurred_at', ev.occurred_at,
          'title', ev.title, 'description', ev.description, 'status', ev.status,
          'recorded_by', public.profile_full_name(ev.recorded_by), 'witness_capacity', ev.witness_capacity, 'backdate_reason', ev.backdate_reason,
          'witness_by', public.profile_full_name(ev.witness_by), 'witness_at', ev.witness_at,
          'params', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('label', pa.label, 'value', pa.value, 'value_text', pa.value_text, 'unit', pa.unit,
                     'quality', pa.quality, 'sampled_at', pa.sampled_at, 'source', pa.source) ORDER BY pa.label)
            FROM startup_event_params pa WHERE pa.event_id = ev.id), '[]'::jsonb)
        ) ORDER BY ev.occurred_at)
        FROM startup_events ev WHERE ev.system_id = s.id AND ev.status <> 'voided'), '[]'::jsonb),

      -- Traspasos completados con checklist, excepciones justificadas y las dos firmas.
      'transfers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'number', tr.number, 'from_stage', tr.from_stage, 'to_stage', tr.to_stage, 'is_reversal', tr.is_reversal,
          'reason', tr.reason, 'checklist', tr.checklist, 'exceptions', tr.exceptions,
          'requested_by', public.profile_full_name(tr.requested_by), 'requested_at', tr.requested_at,
          'commissioning', jsonb_build_object('name', public.profile_full_name(tr.commissioning_signed_by),
                             'company', tr.commissioning_company, 'signed_at', tr.commissioning_signed_at),
          'operations', jsonb_build_object('name', public.profile_full_name(tr.operations_signed_by),
                             'company', tr.operations_company, 'signed_at', tr.operations_signed_at),
          'commissioning_ack', to_jsonb(tr.commissioning_ack), 'operations_ack', to_jsonb(tr.operations_ack),
          'completed_at', tr.completed_at, 'content_hash', tr.content_hash
        ) ORDER BY tr.seq)
        FROM ownership_transfers tr WHERE tr.system_id = s.id AND tr.status = 'completed'), '[]'::jsonb),

      -- Competencias: personas por turno exigidas y nivel vigente de cada persona evaluada en el sistema.
      'competencies', jsonb_build_object(
        'required_per_shift', COALESCE((SELECT ct.required FROM system_competency_targets ct WHERE ct.system_id = s.id), 2),
        'personnel', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', op.full_name, 'company', op.company, 'position', op.position, 'shift', op.shift,
                   'level', public.person_system_level(op.id, s.id),
                   'assessed_at', (SELECT max(cr.assessed_at) FROM competency_records cr WHERE cr.person_id = op.id AND cr.system_id = s.id AND cr.voided_at IS NULL),
                   'expires_at', (SELECT cr.expires_at FROM competency_records cr WHERE cr.person_id = op.id AND cr.system_id = s.id AND cr.voided_at IS NULL
                                  ORDER BY cr.assessed_at DESC, cr.created_at DESC LIMIT 1)
                 ) ORDER BY op.shift NULLS LAST, op.full_name)
          FROM ops_personnel op
          WHERE op.project_id = p_project_id AND op.active
            AND EXISTS (SELECT 1 FROM competency_records cr WHERE cr.person_id = op.id AND cr.system_id = s.id AND cr.voided_at IS NULL)), '[]'::jsonb)),

      'spares', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('kind', cs.kind, 'item', cs.item, 'part_number', cs.part_number, 'tag', t.tag_number,
                 'critical', cs.is_critical, 'qty_required', cs.qty_required, 'qty_available', cs.qty_available,
                 'status', cs.status, 'eta', cs.eta, 'notes', cs.notes) ORDER BY cs.is_critical DESC, cs.item)
        FROM critical_spares cs LEFT JOIN tags t ON t.id = cs.tag_id WHERE cs.system_id = s.id), '[]'::jsonb),

      -- Pruebas de desempeño: revisión vigente, intentos evaluados y PTC con sus tres firmas.
      'performance', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'test_id', pt.id, 'number', pt.number, 'title', pt.title, 'status', pt.status,
          'revision', (SELECT jsonb_build_object('rev', tr2.rev, 'status', tr2.status, 'content_hash', tr2.content_hash,
                         'approved_by', public.profile_full_name(tr2.approved_by), 'approved_at', tr2.approved_at)
                       FROM performance_test_revisions tr2 WHERE tr2.id = pt.current_revision_id),
          'runs', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('run_id', ru.id, 'number', ru.number, 'attempt', ru.attempt, 'status', ru.status,
                     'formal_started_at', ru.formal_started_at, 'closed_at', ru.closed_at, 'result', ru.result,
                     'result_reason', ru.result_reason, 'result_by', public.profile_full_name(ru.result_by), 'result_at', ru.result_at,
                     'evaluation_hash', ru.evaluation_hash) ORDER BY ru.attempt)
            FROM performance_runs ru WHERE ru.test_id = pt.id AND ru.status IN ('closed', 'evaluated')), '[]'::jsonb),
          'certificates', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('number', pc.number, 'status', pc.status, 'run_id', pc.run_id, 'content_hash', pc.content_hash,
                     'commissioning', jsonb_build_object('name', public.profile_full_name(pc.commissioning_signed_by),
                                        'company', pc.commissioning_company, 'signed_at', pc.commissioning_signed_at),
                     'operations', jsonb_build_object('name', public.profile_full_name(pc.operations_signed_by),
                                        'company', pc.operations_company, 'signed_at', pc.operations_signed_at),
                     'client', jsonb_build_object('name', public.profile_full_name(pc.client_signed_by),
                                        'company', pc.client_company, 'signed_at', pc.client_signed_at)) ORDER BY pc.seq)
            FROM performance_certificates pc WHERE pc.test_id = pt.id AND pc.status IN ('accepted', 'pending_signatures')), '[]'::jsonb)
        ) ORDER BY pt.number)
        FROM performance_tests pt WHERE pt.primary_system_id = s.id AND pt.status <> 'withdrawn'), '[]'::jsonb),

      -- Registro documental del sistema: revisión vigente de cada documento ligado.
      'documents', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('document_id', d.id, 'number', d.number, 'title', d.title, 'doc_type', d.doc_type,
                 'company', (SELECT c.name FROM companies c WHERE c.id = d.company_id),
                 'revision', (SELECT jsonb_build_object('revision_id', dr.id, 'rev', dr.rev, 'status', dr.status, 'issued_on', dr.issued_on,
                                'file_name', dr.file_name, 'file_path', dr.file_path, 'external_url', dr.external_url)
                              FROM document_revisions dr WHERE dr.id = d.current_revision_id)
               ) ORDER BY d.number)
        FROM documents d JOIN document_systems ds ON ds.document_id = d.id WHERE ds.system_id = s.id), '[]'::jsonb),

      -- Paquetes de vendor del sistema: FAT/SAT, hallazgos, reporte final y recomendaciones (con MOC).
      'vendors', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'number', vp.number, 'title', vp.title, 'status', vp.status,
          'company', (SELECT c.name FROM companies c WHERE c.id = vp.company_id),
          'mobilized_at', vp.mobilized_at, 'demobilized_at', vp.demobilized_at,
          'activities', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('kind', va.kind, 'title', va.title, 'performed_on', va.performed_on, 'result', va.result,
                     'retest', va.retest_of IS NOT NULL,
                     'findings', (SELECT count(*) FROM vendor_findings vf WHERE vf.activity_id = va.id)) ORDER BY va.created_at)
            FROM vendor_activities va WHERE va.package_id = vp.id), '[]'::jsonb),
          'final_report', (SELECT jsonb_build_object('report_date', vr.report_date, 'issued_by', public.profile_full_name(vr.issued_by),
                             'issued_at', vr.issued_at, 'activities', vr.activities, 'issues', vr.issues)
                           FROM vendor_reports vr WHERE vr.package_id = vp.id AND vr.kind = 'final' ORDER BY vr.issued_at DESC LIMIT 1),
          'recommendations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('seq', rc.seq, 'description', rc.description, 'status', rc.status,
                     'requires_moc', rc.requires_moc, 'moc_reference', rc.moc_reference,
                     'decided_by', public.profile_full_name(rc.decided_by), 'decided_at', rc.decided_at) ORDER BY rc.seq)
            FROM vendor_recommendations rc WHERE rc.package_id = vp.id), '[]'::jsonb)
        ) ORDER BY vp.number)
        FROM vendor_packages vp JOIN vendor_package_systems vs ON vs.package_id = vp.id
        WHERE vs.system_id = s.id AND vp.status <> 'cancelled'), '[]'::jsonb)
    ) ORDER BY s.code), '[]'::jsonb)
  INTO v_systems
  FROM systems s WHERE s.id = ANY (v_scope);

  -- Punch Cat B abiertos o transferidos (los que se heredan con excepción).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'punch_id', pu.id, 'punch_number', pu.punch_number, 'category', pu.category, 'description', pu.description,
    'status', pu.status, 'priority', pu.priority, 'raised_by', pu.raised_by, 'assigned_to', pu.assigned_to,
    'target_date', pu.target_date, 'closed_date', pu.closed_date, 'subsystem_id', pu.subsystem_id, 'tag_id', pu.tag_id,
    'created_at', pu.created_at
  ) ORDER BY pu.punch_number), '[]'::jsonb)
  INTO v_punches
  FROM punches pu JOIN subsystems sub ON sub.id = pu.subsystem_id
  WHERE pu.project_id = p_project_id AND pu.category = 'B' AND sub.system_id = ANY (v_scope);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'certificate_id', c.id, 'certificate_number', c.certificate_number, 'title', c.title, 'status', c.status,
    'issued_date', c.issued_date, 'issued_by', c.issued_by, 'approved_by', c.approved_by,
    'system_id', COALESCE(c.system_id, sub.system_id), 'subsystem_id', c.subsystem_id, 'document_url', c.document_url,
    'signatures', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('role', cs.role, 'name', public.profile_full_name(cs.user_id), 'signed_at', cs.signed_at)
             ORDER BY cs.signed_at)
      FROM certificate_signatures cs WHERE cs.certificate_id = c.id), '[]'::jsonb)
  ) ORDER BY c.certificate_number), '[]'::jsonb)
  INTO v_certs
  FROM certificates c LEFT JOIN subsystems sub ON sub.id = c.subsystem_id
  WHERE c.project_id = p_project_id AND COALESCE(c.system_id, sub.system_id) = ANY (v_scope);

  RETURN jsonb_build_object('handover_package', jsonb_build_object(
    'schema_version', '3.0',
    'generated_at',   to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'org_id',         v_org_id,
    'project',        v_project,
    'systems',        v_systems,
    'punch_items',    v_punches,
    'certificates',   v_certs));
END;
$function$;
