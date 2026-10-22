-- fn: public.start_procedure_run(uuid,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.start_procedure_run(p_procedure_id uuid, p_system_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE p procedures%ROWTYPE; v_role text; v_rev procedure_revisions%ROWTYPE; v_sys uuid; v_seq integer; v_id uuid; v_n integer;
BEGIN
  SELECT * INTO p FROM procedures WHERE id = p_procedure_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_rev FROM procedure_revisions WHERE id = p.current_revision_id AND status = 'approved';
  IF v_rev.id IS NULL THEN RAISE EXCEPTION 'Solo se ejecuta una revisión aprobada' USING ERRCODE = 'P0001'; END IF;
  v_sys := COALESCE(p.system_id, p_system_id);
  IF p.system_id IS NOT NULL AND p_system_id IS NOT NULL AND p_system_id <> p.system_id THEN
    RAISE EXCEPTION 'Este procedimiento es del sistema asignado' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(p.project_id, p.org_id, v_sys, NULL);
  v_seq := public.mgmt_next_seq('procedure_runs', p.project_id);
  SELECT COUNT(*) + 1 INTO v_n FROM procedure_runs WHERE procedure_id = p.id;
  INSERT INTO procedure_runs (org_id, project_id, procedure_id, revision_id, system_id, seq, number, started_by)
  VALUES (p.org_id, p.project_id, p.id, v_rev.id, v_sys, v_seq, p.number || '-R' || v_rev.rev || '-E' || v_n, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO procedure_run_steps (run_id, step_id, project_id, ord)
  SELECT v_id, s.id, p.project_id, s.ord FROM procedure_steps s WHERE s.revision_id = v_rev.id;
  INSERT INTO procedure_run_events (run_id, org_id, project_id, kind, user_id) VALUES (v_id, p.org_id, p.project_id, 'started', auth.uid());
  RETURN v_id;
END;
$function$;
