-- fn: public.refresh_daily_report_data(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.refresh_daily_report_data(p_report_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r daily_reports%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM daily_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'El reporte % ya fue emitido', r.number USING ERRCODE = 'P0001'; END IF;
  UPDATE daily_reports SET data = public.daily_report_data(r.project_id, r.report_date, r.area_id), data_at = now(),
         updated_by = auth.uid(), updated_at = now() WHERE id = p_report_id;
END;
$function$;
