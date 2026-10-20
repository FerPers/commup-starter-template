-- fn: public.issue_certificate(uuid,uuid,text,jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.issue_certificate(p_subsystem_id uuid, p_phase_id uuid, p_notes text DEFAULT NULL::text, p_exceptions jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s subsystems%ROWTYPE; ph project_phases%ROWTYPE; v_org uuid; v_role text; v_block text; v_base text; v_n int; v_number text;
        v_id uuid; v_just uuid[]; e jsonb; v_el jsonb;
BEGIN
  SELECT * INTO s FROM subsystems WHERE id = p_subsystem_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subsistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = s.project_id;
  SELECT * INTO ph FROM project_phases WHERE id = p_phase_id AND org_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fase no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR COALESCE(v_role, '') NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores emiten certificados' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_capacity(s.project_id, 'commissioning') THEN
    RAISE EXCEPTION 'No estás designado para firmar como Comisionamiento en este proyecto' USING ERRCODE = '42501';
  END IF;
  -- Excepciones válidas: Cat B abiertos del subsistema con justificación (= acceptedExceptions).
  v_el := public.certificate_eligibility(s.id, ph.id);
  SELECT array_agg((x ->> 'punch_id')::uuid) INTO v_just
  FROM jsonb_array_elements(COALESCE(p_exceptions, '[]'::jsonb)) x
  WHERE length(btrim(COALESCE(x ->> 'justification', ''))) > 0
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_el -> 'openCatBPunches') b WHERE b ->> 'id' = x ->> 'punch_id');
  v_block := public.certificate_blocker(s.id, ph.id, v_just);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = 'P0001'; END IF;
  v_block := public.certificate_previous_blocker(s.id, ph.id);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM certificates WHERE subsystem_id = s.id AND phase_id = ph.id AND status = 'issued') THEN
    RAISE EXCEPTION 'El subsistema ya tiene un certificado emitido en esta fase' USING ERRCODE = '23505';
  END IF;
  -- Número: <tipo>/<subsistema>, reemisiones -R<n> (= buildCertificateNumber), serializado por base.
  v_base := COALESCE(ph.certificate_name, ph.code) || '/' || s.code;
  PERFORM pg_advisory_xact_lock(hashtext('cert:' || s.project_id::text || ':' || v_base));
  SELECT count(*) INTO v_n FROM certificates
   WHERE project_id = s.project_id
     AND (certificate_number = v_base
          OR (starts_with(certificate_number, v_base || '-R') AND substr(certificate_number, length(v_base) + 3) ~ '^[0-9]+$'));
  v_number := CASE WHEN v_n = 0 THEN v_base ELSE v_base || '-R' || (v_n + 1) END;
  INSERT INTO certificates (project_id, subsystem_id, phase_id, certificate_number, title, status, issued_date, issued_by, notes)
  VALUES (s.project_id, s.id, ph.id, v_number, COALESCE(ph.certificate_name, ph.code) || ' — ' || s.code || ': ' || s.name,
          'issued', public.project_today(s.project_id), auth.uid(), public.mgmt_text(p_notes, 2000))
  RETURNING id INTO v_id;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_exceptions, '[]'::jsonb)) LOOP
    IF (e ->> 'punch_id')::uuid = ANY (COALESCE(v_just, '{}'::uuid[])) THEN
      INSERT INTO certificate_punch_exceptions (certificate_id, punch_id, justification, approved_by)
      VALUES (v_id, (e ->> 'punch_id')::uuid, left(btrim(e ->> 'justification'), 2000), auth.uid());
    END IF;
  END LOOP;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'certificate', v_id, 'issued',
          jsonb_build_object('certNumber', v_number, 'subsystemId', s.id, 'phaseId', ph.id, 'catBExceptions', COALESCE(cardinality(v_just), 0)));
  RETURN v_id;
END;
$function$;
