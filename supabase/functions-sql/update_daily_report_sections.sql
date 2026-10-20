-- fn: public.update_daily_report_sections(uuid,jsonb)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.update_daily_report_sections(p_report_id uuid, p_sections jsonb)
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
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'El reporte % ya fue emitido y no se puede editar', r.number USING ERRCODE = 'P0001'; END IF;
  IF p_sections IS NULL OR jsonb_typeof(p_sections) <> 'object' THEN RAISE EXCEPTION 'Secciones no válidas' USING ERRCODE = '22023'; END IF;
  UPDATE daily_reports SET
    summary          = CASE WHEN p_sections ? 'summary'       THEN public.mgmt_text(p_sections ->> 'summary', 8000)       ELSE summary END,
    key_events       = CASE WHEN p_sections ? 'key_events'    THEN public.mgmt_text(p_sections ->> 'key_events', 8000)    ELSE key_events END,
    issues           = CASE WHEN p_sections ? 'issues'        THEN public.mgmt_text(p_sections ->> 'issues', 8000)        ELSE issues END,
    constraints_text = CASE WHEN p_sections ? 'constraints'   THEN public.mgmt_text(p_sections ->> 'constraints', 8000)   ELSE constraints_text END,
    next_day_plan    = CASE WHEN p_sections ? 'next_day_plan' THEN public.mgmt_text(p_sections ->> 'next_day_plan', 8000) ELSE next_day_plan END,
    updated_by = auth.uid(), updated_at = now()
  WHERE id = p_report_id;
END;
$function$;
