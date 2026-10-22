-- fn: public.verify_lineup_item(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.verify_lineup_item(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE it lineup_items%ROWTYPE; s lineup_sheets%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO it FROM lineup_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fila no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM lineup_sheets WHERE id = it.sheet_id;
  v_role := public.register_caller_role(s.project_id);
  -- S25 (E-36): mismas reglas que set_lineup_item (el cliente no ejecuta line-ups).
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status NOT IN ('issued', 'in_progress') THEN RAISE EXCEPTION 'La hoja no está en ejecución' USING ERRCODE = 'P0001'; END IF;
  IF it.set_at IS NULL THEN RAISE EXCEPTION 'Primero registra la posición de la fila' USING ERRCODE = 'P0001'; END IF;
  IF it.set_by = auth.uid() THEN RAISE EXCEPTION 'La verificación independiente la hace otra persona' USING ERRCODE = '42501'; END IF;
  IF it.found_position IS DISTINCT FROM it.required_position THEN
    RAISE EXCEPTION 'La posición encontrada no es la requerida: corrígela antes de verificar' USING ERRCODE = 'P0001';
  END IF;
  UPDATE lineup_items SET verified_by = auth.uid(), verified_at = now() WHERE id = it.id;
END;
$function$;
