-- fn: public.tag_requirements_audit(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_requirements_audit(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v jsonb;
BEGIN
  -- Compara lo materializado (tras refrescar) con el cálculo en vivo: 0 y 0 = al día. Si el proyecto espera el
  -- recálculo del cron, solo lo dice (cached = false). Para tests y revisiones.
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF NOT public.tag_requirements_refresh(p_project_id) THEN RETURN jsonb_build_object('cached', false); END IF;
  WITH live AS (
    SELECT q.tag_id, q.template_code, q.state, q.itr_id, q.origin, q.reason FROM public.tag_itr_requirements_core(p_project_id) q
  ),
  mat AS (
    SELECT r.tag_id, r.template_code, r.state, r.itr_id, r.origin, r.reason FROM tag_requirement_rows r WHERE r.project_id = p_project_id
  )
  SELECT jsonb_build_object(
    'cached', true,
    'rows', (SELECT count(*) FROM mat),
    'missing_in_cache', (SELECT count(*) FROM (SELECT * FROM live EXCEPT ALL SELECT * FROM mat) x),
    'extra_in_cache', (SELECT count(*) FROM (SELECT * FROM mat EXCEPT ALL SELECT * FROM live) x)
  ) INTO v;
  RETURN v;
END;
$function$;
