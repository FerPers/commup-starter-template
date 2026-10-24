-- A10 guard (ola 1, revisión 2026-10-23 hallazgo 5): un paquete de handover con anexos omitidos no queda ISSUED.
--
-- El paquete limita los PDF de ITR (MAX_ITR_PDFS) y los bytes de documentos, y un anexo que falla al generarse o
-- descargarse queda en `manifest.omitted`; aun así el paquete se marcaba ISSUED, igual que uno completo, y la
-- firma Ed25519 autentica ambos por igual. Ahora:
--   - estado nuevo PARTIAL = firmado y verificable, pero con anexos omitidos; ISSUED = completo;
--   - `omitted_count` en la fila (la pantalla y la API lo muestran sin leer el manifiesto);
--   - verify_handover_package acepta ISSUED y PARTIAL y devuelve `complete` + `omitted` (la página /verify avisa);
--   - la reversión de un traspaso reemplaza también un paquete PARTIAL.
-- Datos: prod tiene un solo paquete, ISSUED y sin omisiones; el relleno de abajo reclasifica igual cualquier
-- ISSUED con omisiones (la verdad del manifiesto firmado).

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.handover_packages DROP CONSTRAINT handover_packages_status_check;
ALTER TABLE public.handover_packages ADD CONSTRAINT handover_packages_status_check
  CHECK (status = ANY (ARRAY['DRAFT', 'GENERATING', 'ISSUED', 'PARTIAL', 'FAILED', 'SUPERSEDED']));
ALTER TABLE public.handover_packages ADD COLUMN IF NOT EXISTS omitted_count integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.handover_packages.omitted_count IS 'A10: anexos que no entraron al paquete (manifest.omitted); > 0 ⇒ status PARTIAL.';

UPDATE public.handover_packages
   SET omitted_count = jsonb_array_length(manifest -> 'omitted'),
       status = CASE WHEN status = 'ISSUED' THEN 'PARTIAL' ELSE status END
 WHERE jsonb_typeof(manifest -> 'omitted') = 'array' AND jsonb_array_length(manifest -> 'omitted') > 0;

CREATE OR REPLACE FUNCTION public.verify_handover_package(p_hash text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'package_id',     hp.id,
    'status',         hp.status,
    'version',        hp.version,
    'generated_at',   hp.generated_at,
    'organization',   o.name,
    'project_code',   p.code,
    'project_name',   p.name,
    'systems',        COALESCE((SELECT jsonb_agg(s.code ORDER BY s.code) FROM handover_package_systems hs
                                JOIN systems s ON s.id = hs.system_id WHERE hs.package_id = hp.id), '[]'::jsonb),
    'signature_alg',  COALESCE(hp.signature_alg, 'hmac-sha256'),
    'signature',      hp.signature,
    'key_id',         hp.key_id,
    'files',          COALESCE(hp.manifest -> 'files', '[]'::jsonb),
    'omitted',        COALESCE(hp.manifest -> 'omitted', '[]'::jsonb),
    'complete',       hp.status = 'ISSUED')
  FROM handover_packages hp
  JOIN projects p ON p.id = hp.project_id
  JOIN organizations o ON o.id = hp.org_id
  WHERE p_hash ~ '^[0-9a-f]{64}$' AND hp.signature_hash = p_hash AND hp.status IN ('ISSUED', 'PARTIAL')
  ORDER BY hp.generated_at DESC
  LIMIT 1
$function$;

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

