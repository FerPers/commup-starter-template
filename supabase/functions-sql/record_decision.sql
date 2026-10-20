-- fn: public.record_decision(uuid,text,text,text,text,uuid,text,date,text,uuid,text,uuid,uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.record_decision(p_project_id uuid, p_title text, p_decision text, p_context text DEFAULT NULL::text, p_rationale text DEFAULT NULL::text, p_decided_by uuid DEFAULT NULL::uuid, p_attendees text DEFAULT NULL::text, p_decided_at date DEFAULT NULL::date, p_source_kind text DEFAULT 'other'::text, p_source_id uuid DEFAULT NULL::uuid, p_source_ref text DEFAULT NULL::text, p_system_id uuid DEFAULT NULL::uuid, p_supersedes_id uuid DEFAULT NULL::uuid, p_supersede_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid; v_old decisions%ROWTYPE; v_reason text;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF public.mgmt_text(p_title, 200) IS NULL OR public.mgmt_text(p_decision, 8000) IS NULL THEN
    RAISE EXCEPTION 'Título y decisión son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF p_decided_at IS NOT NULL AND p_decided_at > public.project_today(p_project_id) THEN
    RAISE EXCEPTION 'La fecha de la decisión no puede ser futura' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, p_decided_by);
  IF COALESCE(p_source_kind, 'other') IN ('tq', 'constraint') THEN
    PERFORM public.mgmt_check_source(p_project_id, p_source_kind, p_source_id);
  ELSIF p_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este origen no admite un registro vinculado' USING ERRCODE = '22023';
  END IF;

  IF p_supersedes_id IS NOT NULL THEN
    SELECT * INTO v_old FROM decisions WHERE id = p_supersedes_id AND project_id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La decisión a reemplazar no pertenece al proyecto' USING ERRCODE = 'P0002'; END IF;
    IF v_old.status <> 'active' THEN RAISE EXCEPTION 'La decisión % ya fue reemplazada', v_old.number USING ERRCODE = 'P0001'; END IF;
    v_reason := public.mgmt_text(p_supersede_reason, 2000);
    IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica por qué se reemplaza la decisión' USING ERRCODE = '22023'; END IF;
  END IF;

  v_seq := public.mgmt_next_seq('decisions', p_project_id);
  INSERT INTO decisions (org_id, project_id, seq, number, title, context, decision, rationale, decided_by, attendees,
                         decided_at, source_kind, source_id, source_ref, system_id, recorded_by)
  VALUES (v_org, p_project_id, v_seq, 'DEC-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(p_title, 200),
          public.mgmt_text(p_context, 8000), public.mgmt_text(p_decision, 8000), public.mgmt_text(p_rationale, 8000),
          COALESCE(p_decided_by, auth.uid()), public.mgmt_text(p_attendees, 2000), COALESCE(p_decided_at, public.project_today(p_project_id)),
          COALESCE(p_source_kind, 'other'), p_source_id, public.mgmt_text(p_source_ref, 200), p_system_id, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.mgmt_log(v_org, p_project_id, 'decision', v_id, 'recorded', NULL, 'active');

  IF p_supersedes_id IS NOT NULL THEN
    UPDATE decisions SET status = 'superseded', superseded_by = v_id, superseded_at = now(), supersede_reason = v_reason
     WHERE id = p_supersedes_id;
    PERFORM public.mgmt_log(v_org, p_project_id, 'decision', p_supersedes_id, 'superseded', 'active', 'superseded', v_reason);
  END IF;
  RETURN v_id;
END;
$function$;
