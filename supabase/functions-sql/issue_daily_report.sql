-- fn: public.issue_daily_report(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.issue_daily_report(p_report_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r daily_reports%ROWTYPE; v_role text; v_hash text;
BEGIN
  SELECT * INTO r FROM daily_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo líderes o superiores emiten el reporte diario' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'El reporte % ya fue emitido', r.number USING ERRCODE = 'P0001'; END IF;
  IF public.mgmt_text(r.summary) IS NULL THEN RAISE EXCEPTION 'El resumen es obligatorio para emitir' USING ERRCODE = '22023'; END IF;

  UPDATE daily_reports SET status = 'issued', issued_by = auth.uid(), issued_at = now(), updated_at = now() WHERE id = p_report_id
  RETURNING * INTO r;
  v_hash := public.daily_report_hash(r);
  UPDATE daily_reports SET content_hash = v_hash WHERE id = p_report_id;
  IF r.supersedes_id IS NOT NULL THEN
    UPDATE daily_reports SET status = 'superseded' WHERE id = r.supersedes_id AND status = 'issued';
  END IF;
  RETURN v_hash;
END;
$function$;
