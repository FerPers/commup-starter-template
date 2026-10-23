-- fn: public.tag_itr_requirements(uuid,uuid[],uuid[],uuid[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_itr_requirements(p_project_id uuid, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(tag_id uuid, template_code text, template_title text, discipline_id uuid, phase_id uuid, origin text, state text, itr_id uuid, itr_status text, reason text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.tag_itr_requirements_core(p_project_id, p_tag_ids, p_system_ids, p_subsystem_ids);
END;
$function$;
