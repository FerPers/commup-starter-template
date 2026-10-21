-- fn: public.transition_register_item(uuid,text,text,jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.transition_register_item(p_item_id uuid, p_to text, p_comment text DEFAULT NULL::text, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item register_items%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_data jsonb; v_comment text;
BEGIN
  SELECT * INTO v_item FROM register_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_item.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  v_comment := NULLIF(left(btrim(COALESCE(p_comment, '')), 2000), '');
  v_data := v_item.data;
  IF p_data IS NOT NULL THEN
    IF jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'Datos no válidos' USING ERRCODE = '22023'; END IF;
    v_data := p_data;
  END IF;

  IF p_to = 'cancelled' THEN
    IF v_item.status IN ('verified', 'cancelled') THEN RAISE EXCEPTION 'El registro % ya está cerrado', v_item.number USING ERRCODE = 'P0001'; END IF;
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede cancelar registros', v_role USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la cancelación' USING ERRCODE = '22023'; END IF;
    UPDATE register_items SET status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancel_reason = v_comment,
                              data = v_data, updated_at = now() WHERE id = p_item_id;
  ELSE
    IF NOT ((v_item.status = 'proposed' AND p_to = 'authorized') OR (v_item.status = 'authorized' AND p_to = 'active')
         OR (v_item.status = 'active' AND p_to = 'removed') OR (v_item.status = 'removed' AND p_to = 'verified')) THEN
      RAISE EXCEPTION 'Transición no permitida: % → %', v_item.status, p_to USING ERRCODE = 'P0001';
    END IF;
    IF p_to = 'authorized' THEN
      IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede autorizar registros', v_role USING ERRCODE = '42501'; END IF;
      IF v_uid = v_item.proposed_by THEN RAISE EXCEPTION 'Quien propone no puede autorizar su propio registro' USING ERRCODE = '42501'; END IF;
    END IF;
    IF p_to = 'verified' AND v_uid = v_item.removed_by THEN
      RAISE EXCEPTION 'La verificación debe hacerla una persona distinta de quien retiró/restauró' USING ERRCODE = '42501';
    END IF;
    -- S23 (D-22): los campos que el estado exige (antes solo los validaba la app; la API o un script los saltaban).
    IF EXISTS (SELECT 1 FROM unnest(public.register_required_fields(v_item.kind, p_to)) k
               WHERE NULLIF(btrim(COALESCE(v_data ->> k, '')), '') IS NULL) THEN
      RAISE EXCEPTION 'Faltan datos para pasar a %: %', p_to,
        (SELECT string_agg(k, ', ') FROM unnest(public.register_required_fields(v_item.kind, p_to)) k
         WHERE NULLIF(btrim(COALESCE(v_data ->> k, '')), '') IS NULL) USING ERRCODE = '22023';
    END IF;
    -- El resultado de una prueba ya registrado no se cambia (un rechazo no se vuelve aceptado en la misma transición).
    IF v_item.kind = 'test_pack' AND v_item.data ->> 'result' IS NOT NULL
       AND (v_data ->> 'result') IS DISTINCT FROM (v_item.data ->> 'result') THEN
      RAISE EXCEPTION 'El resultado de la prueba del % ya está registrado: repite la prueba en un registro nuevo', v_item.number
        USING ERRCODE = 'P0001';
    END IF;
    IF v_item.kind = 'test_pack' AND p_to IN ('removed', 'verified') AND v_data ->> 'result' = 'rejected' THEN
      RAISE EXCEPTION 'La prueba del % fue rechazada: repite la prueba antes de restituir o verificar', v_item.number USING ERRCODE = 'P0001';
    END IF;
    UPDATE register_items SET
      status = p_to, data = v_data, updated_at = now(),
      authorized_by = CASE WHEN p_to = 'authorized' THEN v_uid ELSE authorized_by END,
      authorized_at = CASE WHEN p_to = 'authorized' THEN now() ELSE authorized_at END,
      activated_by  = CASE WHEN p_to = 'active'     THEN v_uid ELSE activated_by END,
      activated_at  = CASE WHEN p_to = 'active'     THEN now() ELSE activated_at END,
      removed_by    = CASE WHEN p_to = 'removed'    THEN v_uid ELSE removed_by END,
      removed_at    = CASE WHEN p_to = 'removed'    THEN now() ELSE removed_at END,
      verified_by   = CASE WHEN p_to = 'verified'   THEN v_uid ELSE verified_by END,
      verified_at   = CASE WHEN p_to = 'verified'   THEN now() ELSE verified_at END
    WHERE id = p_item_id;
  END IF;

  INSERT INTO register_events (item_id, org_id, project_id, action, from_status, to_status, user_id, comment)
  VALUES (p_item_id, v_item.org_id, v_item.project_id, 'transition', v_item.status, p_to, v_uid, v_comment);
  RETURN p_to;
END;
$function$;
