-- fn: public.add_vendor_report(uuid,text,date,integer,numeric,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.add_vendor_report(p_package_id uuid, p_kind text, p_report_date date, p_headcount integer, p_hours numeric, p_activities text, p_issues text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE w record; v_id uuid;
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, false);
  IF (w.pkg).status <> 'mobilized' THEN RAISE EXCEPTION 'Los reportes se registran con el vendor movilizado' USING ERRCODE = 'P0001'; END IF;
  IF p_kind NOT IN ('daily', 'final') THEN RAISE EXCEPTION 'Tipo no válido' USING ERRCODE = '22023'; END IF;
  IF p_report_date IS NULL OR p_report_date > public.project_today((w.pkg).project_id) THEN RAISE EXCEPTION 'Fecha no válida' USING ERRCODE = '22023'; END IF;
  IF public.mgmt_text(p_activities, 8000) IS NULL THEN RAISE EXCEPTION 'Describe las actividades' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'final' AND EXISTS (SELECT 1 FROM vendor_reports WHERE package_id = (w.pkg).id AND kind = 'final') THEN
    RAISE EXCEPTION 'El paquete ya tiene reporte final' USING ERRCODE = '23505';
  END IF;
  INSERT INTO vendor_reports (package_id, project_id, kind, report_date, headcount, hours, activities, issues, issued_by)
  VALUES ((w.pkg).id, (w.pkg).project_id, p_kind, p_report_date, p_headcount, p_hours, public.mgmt_text(p_activities, 8000),
          public.mgmt_text(p_issues, 8000), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
