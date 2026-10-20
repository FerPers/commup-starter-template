-- fn: public.sign_performance_certificate(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.sign_performance_certificate(p_certificate_id uuid, p_capacity text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c performance_certificates%ROWTYPE; r performance_runs%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_status text := 'pending_signatures';
BEGIN
  SELECT * INTO c FROM performance_certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(c.project_id);
  IF v_uid IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'pending_signatures' THEN RAISE EXCEPTION 'El certificado no espera firmas' USING ERRCODE = 'P0001'; END IF;
  IF v_uid IN (c.commissioning_signed_by, c.operations_signed_by, c.client_signed_by) THEN
    RAISE EXCEPTION 'Cada firma del certificado es de una persona distinta' USING ERRCODE = '42501';
  END IF;
  IF p_capacity = 'operations' THEN
    IF c.operations_signed_by IS NOT NULL THEN RAISE EXCEPTION 'Operaciones ya firmó' USING ERRCODE = 'P0001'; END IF;
    -- S14 (D14): firmantes designados (o, sin designados, el rol de respaldo).
    IF NOT public.has_capacity(c.project_id, 'operations') THEN RAISE EXCEPTION 'No estás designado para firmar por Operaciones' USING ERRCODE = '42501'; END IF;
    UPDATE performance_certificates SET operations_signed_by = v_uid, operations_signed_at = now() WHERE id = c.id;
  ELSIF p_capacity = 'client' THEN
    IF c.client_signed_by IS NOT NULL THEN RAISE EXCEPTION 'El cliente ya firmó' USING ERRCODE = 'P0001'; END IF;
    -- S14 (I-25): representante del cliente designado (empresa operadora); sin designados, rol cliente.
    IF NOT public.has_capacity(c.project_id, 'client_rep') THEN RAISE EXCEPTION 'Firma por el Cliente un representante del cliente designado (o, sin designados, un usuario con rol cliente)' USING ERRCODE = '42501'; END IF;
    UPDATE performance_certificates SET client_signed_by = v_uid, client_signed_at = now() WHERE id = c.id;
  ELSE
    RAISE EXCEPTION 'Capacidad no válida' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM performance_certificates WHERE id = c.id;
  IF c.operations_signed_by IS NOT NULL AND c.client_signed_by IS NOT NULL THEN
    SELECT * INTO r FROM performance_runs WHERE id = c.run_id;
    UPDATE performance_certificates SET status = 'accepted', content_hash = encode(sha256(convert_to(jsonb_build_object(
      'certificate', c.number, 'run', r.number, 'evaluation_hash', r.evaluation_hash, 'result', r.result,
      'revision_hash', (SELECT content_hash FROM performance_test_revisions WHERE id = r.revision_id),
      'commissioning', jsonb_build_array(c.commissioning_signed_by, c.commissioning_signed_at),
      'operations', jsonb_build_array(c.operations_signed_by, c.operations_signed_at),
      'client', jsonb_build_array(c.client_signed_by, c.client_signed_at))::text, 'UTF8')), 'hex')
     WHERE id = c.id;
    v_status := 'accepted';
  END IF;
  RETURN v_status;
END;
$function$;
