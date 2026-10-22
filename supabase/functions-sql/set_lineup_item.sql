-- fn: public.set_lineup_item(uuid,text,text,timestamp with time zone,boolean,timestamp with time zone,timestamp with time zone,text,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.set_lineup_item(p_item_id uuid, p_found text, p_remarks text DEFAULT NULL::text, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_check_expected boolean DEFAULT false, p_expected_set_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expected_verified_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_as_found text DEFAULT NULL::text, p_lock_number text DEFAULT NULL::text, p_seal_number text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE it lineup_items%ROWTYPE; s lineup_sheets%ROWTYPE; v_role text;
        v_lock text := public.mgmt_text(p_lock_number, 60); v_seal text := public.mgmt_text(p_seal_number, 60);
BEGIN
  SELECT * INTO it FROM lineup_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fila no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM lineup_sheets WHERE id = it.sheet_id FOR UPDATE;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status NOT IN ('issued', 'in_progress') THEN RAISE EXCEPTION 'La hoja no está en ejecución' USING ERRCODE = 'P0001'; END IF;
  -- S25 (E-21): p_found = posición en que se DEJA la válvula (la que se verifica); p_as_found = como se encontró.
  IF p_found IS NULL THEN RAISE EXCEPTION 'Indica la posición en que queda' USING ERRCODE = '22023'; END IF;
  IF p_as_found IS NOT NULL AND p_as_found NOT IN ('open', 'closed', 'locked_open', 'locked_closed', 'auto', 'manual', 'throttled', 'other') THEN
    RAISE EXCEPTION 'Posición encontrada no válida' USING ERRCODE = '22023';
  END IF;
  IF p_found IN ('locked_open', 'locked_closed') AND v_lock IS NULL AND v_seal IS NULL THEN
    RAISE EXCEPTION 'Una válvula bloqueada (LO/LC) necesita el n.º de candado o de sello' USING ERRCODE = '22023';
  END IF;
  IF p_check_expected AND (it.set_at IS DISTINCT FROM p_expected_set_at OR it.verified_at IS DISTINCT FROM p_expected_verified_at) THEN
    IF it.found_position IS NOT DISTINCT FROM p_found THEN RETURN 'redundant'; END IF;
    RAISE EXCEPTION 'La fila cambió en el servidor después de tu captura' USING ERRCODE = 'CU409';
  END IF;
  UPDATE lineup_items SET found_position = p_found, remarks = public.mgmt_text(p_remarks, 1000), set_by = auth.uid(),
         as_found_position = p_as_found, lock_number = v_lock, seal_number = v_seal,
         set_at = public.startup_field_time(p_captured_at, s.issued_at),
         synced_at = CASE WHEN p_captured_at IS NULL THEN NULL ELSE now() END,
         verified_by = NULL, verified_at = NULL WHERE id = it.id;
  UPDATE lineup_sheets SET status = 'in_progress', updated_at = now() WHERE id = s.id AND status = 'issued';
  RETURN 'applied';
END;
$function$;
