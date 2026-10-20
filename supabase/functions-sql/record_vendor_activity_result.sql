-- fn: public.record_vendor_activity_result(uuid,text,date,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.record_vendor_activity_result(p_activity_id uuid, p_result text, p_performed_on date, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a vendor_activities%ROWTYPE; w record;
BEGIN
  SELECT * INTO a FROM vendor_activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actividad no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO w FROM public.vendor_package_for_write(a.package_id, true);
  IF a.result <> 'pending' THEN RAISE EXCEPTION 'La actividad ya tiene resultado' USING ERRCODE = 'P0001'; END IF;
  IF p_result NOT IN ('passed', 'passed_with_findings', 'failed') THEN RAISE EXCEPTION 'Resultado no válido' USING ERRCODE = '22023'; END IF;
  IF p_performed_on IS NULL OR p_performed_on > public.project_today((w.pkg).project_id) THEN RAISE EXCEPTION 'Fecha de ejecución no válida' USING ERRCODE = '22023'; END IF;
  IF p_result <> 'passed' AND NOT EXISTS (SELECT 1 FROM vendor_findings WHERE activity_id = a.id) THEN
    RAISE EXCEPTION 'Registra los hallazgos antes del resultado' USING ERRCODE = 'P0001';
  END IF;
  UPDATE vendor_activities SET result = p_result, performed_on = p_performed_on, result_by = auth.uid(), result_at = now(),
         notes = COALESCE(public.mgmt_text(p_notes, 4000), notes)
   WHERE id = a.id;
END;
$function$;
