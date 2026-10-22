-- fn: public.record_startup_event(uuid,uuid,text,text,timestamp with time zone,text,text,uuid[],uuid,uuid[],jsonb,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.record_startup_event(p_project_id uuid, p_system_id uuid, p_kind text, p_code text, p_occurred_at timestamp with time zone, p_title text, p_description text DEFAULT NULL::text, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_run_id uuid DEFAULT NULL::uuid, p_signal_ids uuid[] DEFAULT NULL::uuid[], p_manual jsonb DEFAULT NULL::jsonb, p_backdate_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid; v_pre jsonb; v_sig uuid; e jsonb; v_missing text[];
        v_backdate text := public.mgmt_text(p_backdate_reason, 2000); v_at timestamptz; v_val text;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_system_id IS NULL THEN RAISE EXCEPTION 'El evento necesita un sistema' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, NULL);
  IF p_occurred_at IS NULL OR p_occurred_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'La hora del evento no puede ser futura' USING ERRCODE = '22023'; END IF;
  -- S25 (E-16): más de 7 días hacia atrás solo un líder o superior, con motivo (queda en el evento).
  IF p_occurred_at < now() - interval '7 days' THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
      RAISE EXCEPTION 'Un evento de hace más de 7 días lo registra un líder o superior, con motivo' USING ERRCODE = '42501';
    END IF;
    IF v_backdate IS NULL OR length(v_backdate) < 10 THEN
      RAISE EXCEPTION 'Indica por qué se registra un evento de hace más de 7 días (10 caracteres o más)' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_backdate := NULL;
  END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  IF p_run_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM procedure_runs WHERE id = p_run_id AND project_id = p_project_id) THEN
    RAISE EXCEPTION 'La ejecución no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF p_tag_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_tag_ids) x WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.id = x AND t.project_id = p_project_id)) THEN
    RAISE EXCEPTION 'Hay tags que no pertenecen al proyecto' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'milestone' THEN
    IF EXISTS (SELECT 1 FROM startup_events WHERE system_id = p_system_id AND milestone = p_code AND kind = 'milestone' AND status <> 'voided') THEN
      RAISE EXCEPTION 'Este hito ya está registrado en el sistema: anúlalo con motivo para volver a registrarlo' USING ERRCODE = 'P0001';
    END IF;
    -- Bloqueo duro (§12.12): primer arranque y primer HC.
    IF p_code IN ('first_startup', 'first_hydrocarbon') THEN
      v_pre := public.startup_prerequisites(p_system_id);
      v_missing := ARRAY[]::text[];
      IF NOT (v_pre ->> 'gate_ok')::boolean THEN v_missing := v_missing || ('gate ' || COALESCE(v_pre ->> 'gate_code', '?') || ' aprobado con todas sus firmas'); END IF;
      IF NOT (v_pre ->> 'pssr_ok')::boolean THEN v_missing := v_missing || ('PSSR ' || COALESCE(v_pre ->> 'pssr_number', 'del sistema') || ' aprobado'); END IF;
      IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'No se puede registrar este hito: falta %', array_to_string(v_missing, ' y ') USING ERRCODE = 'P0001';
      END IF;
      -- S25 (E-16): los prerrequisitos se cumplían a la hora del hito, no solo hoy.
      SELECT COALESCE(a.completed_at, a.approved_at) INTO v_at FROM system_gate_approvals a
       WHERE a.system_id = p_system_id AND a.gate_id = (v_pre ->> 'gate_id')::uuid AND a.revoked_at IS NULL;
      IF v_at > p_occurred_at THEN
        RAISE EXCEPTION 'El gate % se aprobó (%) después de la hora del hito', v_pre ->> 'gate_code', to_char(v_at, 'YYYY-MM-DD HH24:MI') USING ERRCODE = 'P0001';
      END IF;
      SELECT r.approved_at INTO v_at FROM pssr_reviews r WHERE r.system_id = p_system_id AND r.review_number = v_pre ->> 'pssr_number';
      IF v_at > p_occurred_at THEN
        RAISE EXCEPTION 'El PSSR % se aprobó (%) después de la hora del hito', v_pre ->> 'pssr_number', to_char(v_at, 'YYYY-MM-DD HH24:MI') USING ERRCODE = 'P0001';
      END IF;
    END IF;
    -- S25 (E-16): operación estable y producto on-spec van después de un primer arranque atestiguado (KPI §23).
    IF p_code IN ('first_stable_operation', 'first_on_spec_product') THEN
      SELECT occurred_at INTO v_at FROM startup_events
       WHERE system_id = p_system_id AND kind = 'milestone' AND milestone = 'first_startup' AND status = 'witnessed';
      IF v_at IS NULL THEN
        RAISE EXCEPTION 'Primero se registra y atestigua el primer arranque del sistema' USING ERRCODE = 'P0001';
      END IF;
      IF v_at >= p_occurred_at THEN
        RAISE EXCEPTION 'Este hito debe ser posterior al primer arranque (%)', to_char(v_at, 'YYYY-MM-DD HH24:MI') USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF p_kind <> 'free' THEN
    RAISE EXCEPTION 'Tipo de evento no válido' USING ERRCODE = '22023';
  END IF;

  v_seq := public.mgmt_next_seq('startup_events', p_project_id);
  INSERT INTO startup_events (org_id, project_id, seq, number, system_id, kind, milestone, category, occurred_at, title, description, run_id,
                              status, recorded_by, witness_capacity, backdate_reason)
  VALUES (v_org, p_project_id, v_seq, 'EVT-' || lpad(v_seq::text, 4, '0'), p_system_id, p_kind,
          CASE WHEN p_kind = 'milestone' THEN p_code END, CASE WHEN p_kind = 'free' THEN p_code END,
          p_occurred_at, public.mgmt_text(p_title, 200), public.mgmt_text(p_description, 8000), p_run_id,
          CASE WHEN p_kind = 'milestone' THEN 'pending_witness' ELSE 'recorded' END, auth.uid(),
          CASE WHEN p_kind = 'milestone' THEN public.milestone_witness_capacity(p_code) END, v_backdate)
  RETURNING id INTO v_id;

  IF p_tag_ids IS NOT NULL THEN
    INSERT INTO startup_event_tags (event_id, tag_id, project_id) SELECT DISTINCT v_id, x, p_project_id FROM unnest(p_tag_ids) x;
  END IF;
  FOREACH v_sig IN ARRAY COALESCE(p_signal_ids, ARRAY[]::uuid[]) LOOP
    PERFORM public.startup_snapshot_param(v_id, p_project_id, v_sig, p_occurred_at);
  END LOOP;
  IF p_manual IS NOT NULL THEN
    IF jsonb_typeof(p_manual) <> 'array' OR jsonb_array_length(p_manual) > 50 THEN RAISE EXCEPTION 'Parámetros no válidos' USING ERRCODE = '22023'; END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(p_manual) LOOP
      IF public.mgmt_text(e ->> 'label', 100) IS NULL THEN CONTINUE; END IF;
      -- S25 (E-36): coma decimal igual que add_startup_event_param.
      v_val := btrim(e ->> 'value');
      INSERT INTO startup_event_params (event_id, project_id, label, value, value_text, unit, source, added_by)
      VALUES (v_id, p_project_id, public.mgmt_text(e ->> 'label', 100),
              CASE WHEN v_val ~ '^-?[0-9]+([.,][0-9]+)?$' THEN replace(v_val, ',', '.')::double precision END,
              CASE WHEN NOT (v_val ~ '^-?[0-9]+([.,][0-9]+)?$') THEN public.mgmt_text(v_val, 200) END,
              public.mgmt_text(e ->> 'unit', 30), 'manual', auth.uid());
    END LOOP;
  END IF;
  RETURN v_id;
END;
$function$;
