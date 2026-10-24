-- fn: public.sign_ownership_transfer(uuid,text,text[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.sign_ownership_transfer(p_transfer_id uuid, p_capacity text, p_acknowledged text[] DEFAULT NULL::text[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE tr ownership_transfers%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_item jsonb; v_new text; v_keys text[]; v_missing text[];
BEGIN
  SELECT * INTO tr FROM ownership_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF tr.status <> 'pending_signatures' THEN RAISE EXCEPTION 'El traspaso % no espera firmas', tr.number USING ERRCODE = 'P0001'; END IF;
  v_role := public.register_caller_role(tr.project_id);
  IF v_uid IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  -- S25 (E-13): cada firmante reconoce, una por una, las excepciones justificadas.
  SELECT COALESCE(array_agg(x ->> 'key'), ARRAY[]::text[]) INTO v_keys FROM jsonb_array_elements(COALESCE(tr.exceptions, '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(k), ARRAY[]::text[]) INTO v_missing FROM unnest(v_keys) k WHERE NOT (k = ANY (COALESCE(p_acknowledged, ARRAY[]::text[])));
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Reconoce cada excepción antes de firmar (falta: %)', array_to_string(v_missing, ', ') USING ERRCODE = 'P0001';
  END IF;

  IF p_capacity = 'commissioning' THEN
    -- S14 (D14): firmantes designados del proyecto (o, sin designados, el rol de respaldo).
    IF NOT public.has_capacity(tr.project_id, 'commissioning') THEN RAISE EXCEPTION 'No estás designado para firmar como Comisionamiento' USING ERRCODE = '42501'; END IF;
    IF tr.commissioning_signed_by IS NOT NULL THEN RAISE EXCEPTION 'Comisionamiento ya firmó' USING ERRCODE = 'P0001'; END IF;
    IF tr.operations_signed_by = v_uid THEN RAISE EXCEPTION 'Las dos firmas deben ser de personas distintas' USING ERRCODE = '42501'; END IF;
    UPDATE ownership_transfers SET commissioning_signed_by = v_uid, commissioning_signed_at = now(), commissioning_ack = v_keys WHERE id = tr.id RETURNING * INTO tr;
  ELSIF p_capacity = 'operations' THEN
    IF NOT public.has_capacity(tr.project_id, 'operations') THEN RAISE EXCEPTION 'No estás designado para firmar como Operaciones' USING ERRCODE = '42501'; END IF;
    IF tr.operations_signed_by IS NOT NULL THEN RAISE EXCEPTION 'Operaciones ya firmó' USING ERRCODE = 'P0001'; END IF;
    IF tr.commissioning_signed_by = v_uid THEN RAISE EXCEPTION 'Las dos firmas deben ser de personas distintas' USING ERRCODE = '42501'; END IF;
    UPDATE ownership_transfers SET operations_signed_by = v_uid, operations_signed_at = now(), operations_ack = v_keys WHERE id = tr.id RETURNING * INTO tr;
  ELSE
    RAISE EXCEPTION 'Capacidad no válida' USING ERRCODE = '22023';
  END IF;

  IF tr.commissioning_signed_by IS NULL OR tr.operations_signed_by IS NULL THEN RETURN 'pending_signatures'; END IF;

  -- Segunda firma: el checklist no puede haber empeorado sin justificación.
  IF NOT tr.is_reversal THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(public.ownership_checklist(tr.system_id, tr.to_stage)) WHERE NOT (value ->> 'ok')::boolean LOOP
      IF (v_item ->> 'key') = ANY (public.org_transfer_non_dispensable(tr.org_id)) THEN
        RAISE EXCEPTION 'Falta «%» y la política de la organización no permite dispensarlo', v_item ->> 'key' USING ERRCODE = 'P0001';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(tr.exceptions) x WHERE x ->> 'key' = v_item ->> 'key') THEN
        v_new := v_item ->> 'key';
        RAISE EXCEPTION 'El checklist cambió desde la solicitud: ahora falta «%». Cancela y vuelve a pedir el traspaso', v_new USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  UPDATE ownership_transfers SET status = 'completed', completed_at = now(),
         content_hash = encode(sha256(convert_to(jsonb_build_object('number', tr.number, 'system', tr.system_id, 'from', tr.from_stage, 'to', tr.to_stage,
           'checklist', tr.checklist, 'exceptions', tr.exceptions, 'reason', tr.reason, 'c', tr.commissioning_signed_by, 'c_at', tr.commissioning_signed_at,
           'o', tr.operations_signed_by, 'o_at', tr.operations_signed_at, 'c_ack', tr.commissioning_ack, 'o_ack', tr.operations_ack)::text, 'UTF8')), 'hex')
   WHERE id = tr.id;
  UPDATE system_ownership SET stage = tr.to_stage, since = now(), last_transfer_id = tr.id WHERE system_id = tr.system_id;
  -- Reversión desde Operaciones: el paquete de handover emitido por el traspaso anterior queda reemplazado (§12.26).
  IF tr.is_reversal AND tr.from_stage = 'operations' THEN
    UPDATE handover_packages SET status = 'SUPERSEDED'
     WHERE status IN ('ISSUED', 'PARTIAL') AND id IN (SELECT handover_package_id FROM ownership_transfers
                                        WHERE system_id = tr.system_id AND to_stage = 'operations' AND handover_package_id IS NOT NULL);
  END IF;
  RETURN 'completed';
END;
$function$;
