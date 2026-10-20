-- fn: public.approve_pssr(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.approve_pssr(p_review_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r pssr_reviews%ROWTYPE; v_role text; v_missing text[]; v_block text; v_phase uuid; v_cert uuid; v_n integer;
        v_sys systems%ROWTYPE; v_number text;
BEGIN
  SELECT * INTO r FROM pssr_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PSSR no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores aprueban el PSSR' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_capacity(r.project_id, 'commissioning') THEN
    RAISE EXCEPTION 'No estás designado para firmar como Comisionamiento en este proyecto' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Solo se aprueba un PSSR enviado a aprobación' USING ERRCODE = 'P0001'; END IF;
  IF r.submitted_by = auth.uid() THEN RAISE EXCEPTION 'Aprueba una persona distinta de quien envió el PSSR' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM pssr_signatures WHERE review_id = r.id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Quien aprueba no puede ser uno de los firmantes' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(c) INTO v_missing FROM unnest(r.required_signatures) c
   WHERE NOT EXISTS (SELECT 1 FROM pssr_signatures s WHERE s.review_id = r.id AND s.capacity = c);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'Faltan firmas: %', array_to_string(v_missing, ', ') USING ERRCODE = 'P0001'; END IF;
  v_n := public.pssr_items_pending(r.id);
  IF v_n > 0 THEN RAISE EXCEPTION '% ítem(s) sin completar o con estado NO', v_n USING ERRCODE = 'P0001'; END IF;
  v_block := public.pssr_punch_blocker(r.id);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = 'P0001'; END IF;

  -- Fase que emite el RFSU (certificado «RFSU…»); si no hay, la última fase de la org (como hacía la acción).
  SELECT id INTO v_phase FROM project_phases WHERE org_id = r.org_id AND certificate_name ILIKE 'RFSU%' ORDER BY order_index LIMIT 1;
  IF v_phase IS NULL THEN SELECT id INTO v_phase FROM project_phases WHERE org_id = r.org_id ORDER BY order_index DESC LIMIT 1; END IF;
  IF v_phase IS NULL THEN RAISE EXCEPTION 'No hay fases configuradas en la organización' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_sys FROM systems WHERE id = r.system_id;
  -- Numeración serializada por proyecto (S17 la reemplaza por un contador atómico por tipo y subsistema).
  PERFORM pg_advisory_xact_lock(hashtext('rfsu:' || r.project_id::text));
  SELECT 'RFSU-' || lpad((count(*) + 1)::text, 3, '0') INTO v_number FROM certificates WHERE project_id = r.project_id;
  INSERT INTO certificates (project_id, system_id, phase_id, certificate_number, title, status, issued_date, issued_by, approved_by)
  VALUES (r.project_id, r.system_id, v_phase, v_number, 'RFSU — ' || COALESCE(v_sys.name, 'Sistema') || ' (' || COALESCE(v_sys.code, '') || ')',
          'issued', public.project_today(r.project_id), auth.uid(), auth.uid())
  RETURNING id INTO v_cert;
  UPDATE pssr_reviews SET status = 'approved', approved_by = auth.uid(), approved_at = now(), rfsu_certificate_id = v_cert, updated_at = now()
   WHERE id = r.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (r.org_id, auth.uid(), 'pssr', r.id, 'approved', jsonb_build_object('projectId', r.project_id, 'certNumber', v_number, 'certId', v_cert));
  RETURN v_cert;
END;
$function$;
