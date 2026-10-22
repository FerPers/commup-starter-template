-- fn: public.complete_lineup_sheet(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.complete_lineup_sheet(p_sheet_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s lineup_sheets%ROWTYPE; v_role text; v_bad integer; v_hash text;
BEGIN
  SELECT * INTO s FROM lineup_sheets WHERE id = p_sheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hoja no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status <> 'in_progress' THEN RAISE EXCEPTION 'La hoja no está en ejecución' USING ERRCODE = 'P0001'; END IF;
  SELECT COUNT(*) INTO v_bad FROM lineup_items WHERE sheet_id = s.id
     AND (found_position IS DISTINCT FROM required_position OR (is_critical AND verified_at IS NULL));
  IF v_bad > 0 THEN RAISE EXCEPTION '% fila(s) sin alinear o críticas sin verificar', v_bad USING ERRCODE = 'P0001'; END IF;
  UPDATE lineup_sheets SET status = 'superseded', superseded_at = now(), updated_at = now()
   WHERE system_id = s.system_id AND purpose = s.purpose AND status = 'verified' AND id <> s.id;
  v_hash := encode(sha256(convert_to(jsonb_build_object('number', s.number, 'system', s.system_id, 'items',
              (SELECT jsonb_agg(jsonb_build_object('ord', ord, 'tag', tag_id, 'label', label, 'req', required_position, 'found', found_position,
                 'critical', is_critical, 'set_by', set_by, 'set_at', set_at, 'verified_by', verified_by, 'verified_at', verified_at)
                 -- S25 (E-21): encontrada, candado y sello solo si se cargaron (las hojas anteriores conservan su hash).
                 || jsonb_strip_nulls(jsonb_build_object('as_found', as_found_position, 'lock', lock_number, 'seal', seal_number)) ORDER BY ord)
               FROM lineup_items WHERE sheet_id = s.id))::text, 'UTF8')), 'hex');
  UPDATE lineup_sheets SET status = 'verified', verified_by = auth.uid(), verified_at = now(), content_hash = v_hash, updated_at = now() WHERE id = s.id;
  RETURN v_hash;
END;
$function$;
