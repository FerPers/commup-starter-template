-- fn: public.set_daily_report_ai_draft(uuid,jsonb,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.set_daily_report_ai_draft(p_report_id uuid, p_draft jsonb, p_model text)
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
  IF p_draft IS NULL OR jsonb_typeof(p_draft) <> 'object' THEN RAISE EXCEPTION 'Borrador no válido' USING ERRCODE = '22023'; END IF;
  UPDATE daily_reports SET
    ai_draft = p_draft, ai_model = left(p_model, 60), ai_generated_at = now(),
    summary          = COALESCE(public.mgmt_text(summary, 8000),          public.mgmt_text(p_draft ->> 'summary', 8000)),
    key_events       = COALESCE(public.mgmt_text(key_events, 8000),       public.mgmt_text(p_draft ->> 'key_events', 8000)),
    issues           = COALESCE(public.mgmt_text(issues, 8000),           public.mgmt_text(p_draft ->> 'issues', 8000)),
    constraints_text = COALESCE(public.mgmt_text(constraints_text, 8000), public.mgmt_text(p_draft ->> 'constraints', 8000)),
    next_day_plan    = COALESCE(public.mgmt_text(next_day_plan, 8000),    public.mgmt_text(p_draft ->> 'next_day_plan', 8000)),
    updated_by = auth.uid(), updated_at = now()
  WHERE id = p_report_id;
END;
$function$;
