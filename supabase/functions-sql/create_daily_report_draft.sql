-- fn: public.create_daily_report_draft(uuid,date,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.create_daily_report_draft(p_project_id uuid, p_date date DEFAULT NULL::date, p_area_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_proj projects%ROWTYPE; v_id uuid; v_status text;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  -- S10 (D-05, D12): «hoy» es el del proyecto (projects.timezone), no el de UTC.
  p_date := COALESCE(p_date, public.project_today(p_project_id));
  IF p_date > public.project_today(p_project_id) + 1 THEN RAISE EXCEPTION 'Fecha de reporte no válida' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_proj FROM projects WHERE id = p_project_id;
  PERFORM pg_advisory_xact_lock(hashtext('daily_reports:' || p_project_id::text || ':' || p_date::text));

  SELECT id, status INTO v_id, v_status FROM daily_reports
   WHERE project_id = p_project_id AND report_date = p_date ORDER BY revision DESC LIMIT 1;
  IF v_id IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'El reporte del % ya fue emitido: crea una revisión para corregirlo', p_date USING ERRCODE = 'P0001';
  END IF;
  IF v_id IS NOT NULL THEN
    UPDATE daily_reports SET area_id = p_area_id, data = public.daily_report_data(p_project_id, p_date, p_area_id), data_at = now(),
           updated_by = auth.uid(), updated_at = now() WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO daily_reports (org_id, project_id, report_date, revision, number, area_id, data, created_by, updated_by)
  VALUES (v_proj.org_id, p_project_id, p_date, 0, 'RD-' || v_proj.code || '-' || to_char(p_date, 'YYYYMMDD'), p_area_id,
          public.daily_report_data(p_project_id, p_date, p_area_id), auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
