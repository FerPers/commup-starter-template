-- fn: public.tag_requirements_refresh(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_requirements_refresh(p_project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
BEGIN
  -- Al leer: true = tag_requirement_rows está al día (se recalcularon los tags sucios); false = hay que calcular en
  -- vivo porque el proyecto espera un recálculo completo (lo hace el cron: a 50.000 tags tarda ~20 s y el rol de
  -- la API corta a los 8 s) o porque otro lo está recalculando en este momento.
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  RETURN public.tag_requirements_sync(p_project_id);
END;
$function$;
