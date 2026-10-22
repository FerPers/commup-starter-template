-- fn: public.set_lineup_item(uuid,text,text,timestamp with time zone,boolean,timestamp with time zone,timestamp with time zone)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.set_lineup_item(p_item_id uuid, p_found text, p_remarks text DEFAULT NULL::text, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_check_expected boolean DEFAULT false, p_expected_set_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expected_verified_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE it lineup_items%ROWTYPE; s lineup_sheets%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO it FROM lineup_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fila no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM lineup_sheets WHERE id = it.sheet_id FOR UPDATE;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status NOT IN ('issued', 'in_progress') THEN RAISE EXCEPTION 'La hoja no está en ejecución' USING ERRCODE = 'P0001'; END IF;
  IF p_found IS NULL THEN RAISE EXCEPTION 'Indica la posición encontrada' USING ERRCODE = '22023'; END IF;
  IF p_check_expected AND (it.set_at IS DISTINCT FROM p_expected_set_at OR it.verified_at IS DISTINCT FROM p_expected_verified_at) THEN
    IF it.found_position IS NOT DISTINCT FROM p_found THEN RETURN 'redundant'; END IF;
    RAISE EXCEPTION 'La fila cambió en el servidor después de tu captura' USING ERRCODE = 'CU409';
  END IF;
  UPDATE lineup_items SET found_position = p_found, remarks = public.mgmt_text(p_remarks, 1000), set_by = auth.uid(),
         set_at = public.startup_field_time(p_captured_at, s.issued_at),
         synced_at = CASE WHEN p_captured_at IS NULL THEN NULL ELSE now() END,
         verified_by = NULL, verified_at = NULL WHERE id = it.id;
  UPDATE lineup_sheets SET status = 'in_progress', updated_at = now() WHERE id = s.id AND status = 'issued';
  RETURN 'applied';
END;
$function$;
