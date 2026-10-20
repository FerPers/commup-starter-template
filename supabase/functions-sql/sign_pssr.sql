-- fn: public.sign_pssr(uuid,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.sign_pssr(p_review_id uuid, p_capacity text, p_signature_data text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r pssr_reviews%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO r FROM pssr_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PSSR no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_member(r.project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Solo se firma un PSSR enviado a aprobación' USING ERRCODE = 'P0001'; END IF;
  IF NOT (p_capacity = ANY (r.required_signatures)) THEN RAISE EXCEPTION 'Este PSSR no requiere la firma %', p_capacity USING ERRCODE = '22023'; END IF;
  IF NOT public.has_capacity(r.project_id, p_capacity) THEN
    RAISE EXCEPTION 'No estás designado para firmar como % en este proyecto', p_capacity USING ERRCODE = '42501';
  END IF;
  IF r.submitted_by = auth.uid() THEN RAISE EXCEPTION 'Firma una persona distinta de quien envió el PSSR' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM pssr_signatures WHERE review_id = r.id AND capacity = p_capacity) THEN
    RAISE EXCEPTION 'La firma % ya fue registrada', p_capacity USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM pssr_signatures WHERE review_id = r.id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ya firmaste este PSSR: cada firma es de una persona distinta' USING ERRCODE = '23505';
  END IF;
  IF p_signature_data IS NULL OR length(p_signature_data) < 20 OR length(p_signature_data) > 300000 THEN
    RAISE EXCEPTION 'Firma no válida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO pssr_signatures (review_id, user_id, discipline, capacity, signature_data, signed_at)
  VALUES (r.id, auth.uid(), p_capacity, p_capacity, p_signature_data, now())
  RETURNING id INTO v_id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (r.org_id, auth.uid(), 'pssr', r.id, 'signed', jsonb_build_object('capacity', p_capacity));
  RETURN v_id;
END;
$function$;
