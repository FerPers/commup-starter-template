-- fn: public.project_discipline_scope(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.project_discipline_scope(p_project_id uuid)
 RETURNS TABLE(discipline_id uuid, code text, name text, color text, included boolean, requirements integer, itrs integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE v_org uuid; v_phases uuid[];
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT p.org_id INTO v_org FROM projects p WHERE p.id = p_project_id;
  SELECT array_agg(ph.id) INTO v_phases FROM project_phases ph WHERE ph.org_id = v_org;

  RETURN QUERY
  WITH c AS (
    SELECT c.discipline_id, count(*)::int AS n
    FROM public.itr_generation_candidates(p_project_id, COALESCE(v_phases, '{}')) c
    WHERE c.discipline_id IS NOT NULL GROUP BY c.discipline_id
  ),
  i AS (
    SELECT tp.discipline_id, count(*)::int AS n
    FROM itrs it JOIN itr_templates tp ON tp.id = it.template_id
    WHERE it.project_id = p_project_id GROUP BY tp.discipline_id
  )
  SELECT d.id, d.code, d.name, d.color,
         EXISTS (SELECT 1 FROM project_disciplines pd WHERE pd.project_id = p_project_id AND pd.discipline_id = d.id),
         COALESCE(c.n, 0), COALESCE(i.n, 0)
  FROM disciplines d
  LEFT JOIN c ON c.discipline_id = d.id
  LEFT JOIN i ON i.discipline_id = d.id
  WHERE d.org_id = v_org
  ORDER BY d.code;
END;
$function$;
