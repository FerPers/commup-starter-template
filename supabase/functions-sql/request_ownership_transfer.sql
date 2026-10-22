-- fn: public.request_ownership_transfer(uuid,text,jsonb,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.request_ownership_transfer(p_system_id uuid, p_to_stage text, p_exceptions jsonb DEFAULT '[]'::jsonb, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_proj uuid; v_org uuid; v_role text; v_from text; v_seq integer; v_id uuid; v_check jsonb := '[]'::jsonb; v_exc jsonb := '[]'::jsonb;
        v_reversal boolean; v_item jsonb; v_just text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT s.project_id, p.org_id INTO v_proj, v_org FROM systems s JOIN projects p ON p.id = s.project_id WHERE s.id = p_system_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_proj);
  IF auth.uid() IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  -- S25 (E-13): pide el traspaso un líder o superior.
  IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores piden un traspaso' USING ERRCODE = '42501'; END IF;
  INSERT INTO system_ownership (system_id, org_id, project_id) VALUES (p_system_id, v_org, v_proj) ON CONFLICT (system_id) DO NOTHING;
  SELECT stage INTO v_from FROM system_ownership WHERE system_id = p_system_id FOR UPDATE;
  IF public.ownership_stage_index(p_to_stage) IS NULL THEN RAISE EXCEPTION 'Etapa no válida' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM ownership_transfers WHERE system_id = p_system_id AND status = 'pending_signatures') THEN
    RAISE EXCEPTION 'Ya hay un traspaso pendiente de firmas en este sistema' USING ERRCODE = 'P0001';
  END IF;

  IF public.ownership_stage_index(p_to_stage) = public.ownership_stage_index(v_from) + 1 THEN
    v_reversal := false;
    v_check := public.ownership_checklist(p_system_id, p_to_stage);
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_check) WHERE NOT (value ->> 'ok')::boolean LOOP
      -- S25 (E-13): los ítems no dispensables de la org no se saltan con una justificación.
      IF (v_item ->> 'key') = ANY (public.org_transfer_non_dispensable(v_org)) THEN
        RAISE EXCEPTION 'Falta «%» y la política de la organización no permite dispensarlo', v_item ->> 'key' USING ERRCODE = 'P0001';
      END IF;
      SELECT public.mgmt_text(x ->> 'justification', 2000) INTO v_just
      FROM jsonb_array_elements(COALESCE(p_exceptions, '[]'::jsonb)) x WHERE x ->> 'key' = v_item ->> 'key' LIMIT 1;
      IF v_just IS NULL OR length(v_just) < 10 THEN
        RAISE EXCEPTION 'Falta «%»: justifica la excepción (10 caracteres o más) para pedir el traspaso', v_item ->> 'key' USING ERRCODE = 'P0001';
      END IF;
      v_exc := v_exc || jsonb_build_object('key', v_item ->> 'key', 'justification', v_just);
    END LOOP;
  ELSIF public.ownership_stage_index(p_to_stage) < public.ownership_stage_index(v_from) THEN
    v_reversal := true;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Indica el motivo de la reversión (10 caracteres o más)' USING ERRCODE = '22023'; END IF;
  ELSE
    RAISE EXCEPTION 'Solo se pide la etapa siguiente (o una anterior como reversión)' USING ERRCODE = 'P0001';
  END IF;

  v_seq := public.mgmt_next_seq('ownership_transfers', v_proj);
  INSERT INTO ownership_transfers (org_id, project_id, system_id, seq, number, from_stage, to_stage, is_reversal, reason, checklist, exceptions, requested_by)
  VALUES (v_org, v_proj, p_system_id, v_seq, 'TRF-' || lpad(v_seq::text, 4, '0'), v_from, p_to_stage, v_reversal, v_reason, v_check, v_exc, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
