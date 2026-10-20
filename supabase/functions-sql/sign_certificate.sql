-- fn: public.sign_certificate(uuid,text,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.sign_certificate(p_certificate_id uuid, p_role text, p_comments text DEFAULT NULL::text, p_signature_image text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c certificates%ROWTYPE; v_cap text := public.certificate_role_capacity(p_role); v_org uuid; v_n int;
BEGIN
  SELECT * INTO c FROM certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_member(c.project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_cap IS NULL THEN RAISE EXCEPTION 'Rol de firma no válido' USING ERRCODE = '22023'; END IF;
  IF c.status <> 'issued' THEN RAISE EXCEPTION 'Solo se firma un certificado emitido' USING ERRCODE = 'P0001'; END IF;
  IF c.is_blocked THEN RAISE EXCEPTION 'El certificado está bloqueado: %', COALESCE(c.block_reason, 'la base cambió') USING ERRCODE = 'P0001'; END IF;
  IF NOT public.has_capacity(c.project_id, v_cap) THEN
    RAISE EXCEPTION 'No estás designado para firmar como % en este proyecto', v_cap USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM certificate_signatures WHERE certificate_id = c.id AND role::text = p_role) THEN
    RAISE EXCEPTION 'Ya existe una firma para el rol %', p_role USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM certificate_signatures WHERE certificate_id = c.id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ya firmaste este certificado: cada rol lo firma una persona distinta' USING ERRCODE = '23505';
  END IF;
  IF p_signature_image IS NOT NULL AND (p_signature_image NOT LIKE 'data:image/%' OR length(p_signature_image) > 262144) THEN
    RAISE EXCEPTION 'Firma no válida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO certificate_signatures (certificate_id, user_id, role, comments, signature_image)
  VALUES (c.id, auth.uid(), p_role::cert_signature_role, public.mgmt_text(p_comments, 2000), p_signature_image);
  SELECT org_id INTO v_org FROM projects WHERE id = c.project_id;
  SELECT count(*) INTO v_n FROM certificate_signatures WHERE certificate_id = c.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'certificate', c.id, 'signed', jsonb_build_object('role', p_role, 'projectId', c.project_id));
  IF v_n >= 3 THEN
    INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
    VALUES (v_org, auth.uid(), 'certificate', c.id, 'fully_signed', jsonb_build_object('projectId', c.project_id, 'certNumber', c.certificate_number));
  END IF;
  RETURN jsonb_build_object('signatures', v_n, 'fully_signed', v_n >= 3);
END;
$function$;
