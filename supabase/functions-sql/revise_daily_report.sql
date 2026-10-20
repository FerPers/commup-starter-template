-- fn: public.revise_daily_report(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.revise_daily_report(p_report_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r daily_reports%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000); v_id uuid; v_base text;
BEGIN
  SELECT * INTO r FROM daily_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores revisan el reporte diario' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'issued' THEN RAISE EXCEPTION 'Solo se revisa el reporte emitido vigente' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM daily_reports WHERE project_id = r.project_id AND report_date = r.report_date AND revision > r.revision) THEN
    RAISE EXCEPTION 'Ya existe una revisión posterior de %', r.number USING ERRCODE = 'P0001';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la revisión' USING ERRCODE = '22023'; END IF;
  v_base := regexp_replace(r.number, '-R\d+$', '');
  INSERT INTO daily_reports (org_id, project_id, report_date, revision, number, area_id, data, data_at, summary, key_events, issues,
                             constraints_text, next_day_plan, ai_draft, ai_model, ai_generated_at, revision_reason, supersedes_id, created_by, updated_by)
  VALUES (r.org_id, r.project_id, r.report_date, r.revision + 1, v_base || '-R' || (r.revision + 1), r.area_id, r.data, r.data_at, r.summary,
          r.key_events, r.issues, r.constraints_text, r.next_day_plan, r.ai_draft, r.ai_model, r.ai_generated_at, v_reason, r.id, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
